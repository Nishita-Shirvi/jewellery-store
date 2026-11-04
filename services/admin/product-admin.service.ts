import "server-only";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { slugify, type ProductFormInput } from "@/lib/validation/admin";
import { CATALOG_TAG } from "@/services/catalog.service";
import { reindexSearchText } from "@/services/search.service";
import { syncProductSummaries } from "@/services/inventory.service";
import { nudgeStockAlerts } from "@/services/marketing.service";

export const ADMIN_PAGE_SIZE = 20;

export async function listProductsAdmin(query: { page: number; q?: string; status?: string }) {
  const where: Prisma.ProductWhereInput = {
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    ...(query.status === "active"
      ? { isActive: true }
      : query.status === "inactive"
        ? { isActive: false }
        : {}),
    ...(query.status === "low" ? { stock: { lte: 3 } } : {}),
  };
  const [total, items] = await db.$transaction([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        slug: true,
        priceInPaise: true,
        stock: true,
        reservedStock: true,
        isActive: true,
        isFeatured: true,
        images: true,
        category: { select: { name: true } },
        _count: { select: { options: true, variants: { where: { isActive: true } } } },
      },
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getProductAdmin(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: { _count: { select: { options: true } } },
  });
  if (!product) return null;
  const { _count, ...rest } = product;
  return { ...rest, hasOptions: _count.options > 0 };
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const clash = await db.product.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error("Could not create a unique slug");
}

/** Product fields from the form. Price/stock are summaries of the variants (synced separately). */
function toData(input: ProductFormInput) {
  return {
    name: input.name,
    description: input.description,
    makingChargeInPaise: input.makingCharge,
    images: input.images,
    isActive: input.isActive,
    isFeatured: input.isFeatured,
    isReturnable: input.isReturnable,
    metalType: input.metalType,
    purity: input.purity,
    metalColour: input.metalColour,
    netWeightMg: input.netWeight ?? 0,
    grossWeightMg: input.grossWeight,
    gemstone: input.gemstone,
    tags: input.tags,
    huid: input.huid,
    hsnCode: input.hsnCode,
    gstRateBps: input.gstRate,
    category: { connect: { id: input.categoryId } },
  };
}

export class AdminInputError extends Error {}

export async function createProduct(input: ProductFormInput, adminId: string) {
  await assertCategoryExists(input.categoryId);
  const slug = await uniqueSlug(input.slug ?? slugify(input.name));
  let product: { id: string; slug: string };
  try {
    product = await db.product.create({
      data: {
        ...toData(input),
        slug,
        priceInPaise: input.price,
        stock: input.stock,
        // Every product is sold through a variant; a new product starts with one base variant.
        variants: {
          create: {
            sku: slug.toUpperCase().slice(0, 80).replace(/-+$/, ""),
            priceInPaise: input.price,
            stock: input.stock,
            netWeightMg: input.netWeight ?? 0,
            grossWeightMg: input.grossWeight,
            images: [],
          },
        },
      },
      select: { id: true, slug: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AdminInputError("Another product or variant already uses that SKU/slug.");
    throw error;
  }
  revalidateTag(CATALOG_TAG);
  logger.info("admin.product_created", { adminId, productId: product.id });
  return product;
}

export async function updateProduct(id: string, input: ProductFormInput, adminId: string) {
  await assertCategoryExists(input.categoryId);
  const slug = input.slug ? await uniqueSlug(input.slug, id) : undefined;
  try {
    const product = await db.$transaction(async (tx) => {
      const hasOptions = (await tx.productOption.count({ where: { productId: id } })) > 0;
      if (!hasOptions) {
        // No options: the form's price/stock/weight belong to the single base variant.
        // Variant row first, then the product row (same lock order as checkout).
        await updateBaseVariant(tx, id, {
          priceInPaise: input.price,
          stock: input.stock,
          netWeightMg: input.netWeight ?? 0,
          grossWeightMg: input.grossWeight ?? null,
        });
      }
      const saved = await tx.product.update({
        where: { id },
        data: { ...toData(input), ...(slug ? { slug } : {}) },
        select: { id: true, slug: true },
      });
      await syncProductSummaries(tx, [id]);
      return saved;
    });
    revalidateTag(CATALOG_TAG);
    await nudgeStockAlerts();
    await reindexSearchText({ productId: id });
    logger.info("admin.product_updated", { adminId, productId: id });
    return product;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AdminInputError("Product not found.");
    }
    throw error;
  }
}

export async function setProductActive(id: string, isActive: boolean, adminId: string) {
  const result = await db.product.updateMany({ where: { id }, data: { isActive } });
  if (result.count === 0) throw new AdminInputError("Product not found.");
  revalidateTag(CATALOG_TAG);
  logger.info("admin.product_active_changed", { adminId, productId: id, isActive });
}

/**
 * Sets the base variant's stock/price/weight. Refuses to set stock below the units currently held
 * in checkouts (that would make a paying customer's order fail). The check and the write are one
 * conditional UPDATE, so a checkout that grabs stock at the same moment can't slip through.
 */
async function updateBaseVariant(
  tx: Prisma.TransactionClient,
  productId: string,
  data: { priceInPaise: number; stock: number; netWeightMg: number; grossWeightMg: number | null },
) {
  const base = await tx.productVariant.findFirst({
    where: { productId, optionKey: "" },
    select: { id: true, reservedStock: true },
  });
  if (!base) throw new AdminInputError("Product not found.");
  const updated = await tx.$executeRaw`
    UPDATE "ProductVariant" SET
      "priceInPaise" = ${data.priceInPaise},
      "stock" = ${data.stock},
      "netWeightMg" = ${data.netWeightMg},
      "grossWeightMg" = ${data.grossWeightMg}::int,
      "updatedAt" = NOW()
    WHERE "id" = ${base.id} AND "reservedStock" <= ${data.stock}`;
  if (updated === 0)
    throw new AdminInputError(
      `Stock can't go below the units held in checkouts right now (${base.reservedStock}).`,
    );
}

export async function setProductStock(id: string, stock: number, adminId: string) {
  await db.$transaction(async (tx) => {
    if ((await tx.productOption.count({ where: { productId: id } })) > 0)
      throw new AdminInputError("This piece has options — set stock per variant.");
    const base = await tx.productVariant.findFirst({
      where: { productId: id, optionKey: "" },
      select: { id: true, reservedStock: true },
    });
    if (!base) throw new AdminInputError("Product not found.");
    const updated = await tx.$executeRaw`
      UPDATE "ProductVariant" SET "stock" = ${stock}, "updatedAt" = NOW()
      WHERE "id" = ${base.id} AND "reservedStock" <= ${stock}`;
    if (updated === 0)
      throw new AdminInputError(
        `Stock can't go below the units held in checkouts right now (${base.reservedStock}).`,
      );
    await syncProductSummaries(tx, [id]);
  });
  revalidateTag(CATALOG_TAG);
  await nudgeStockAlerts();
  logger.info("admin.product_stock_changed", { adminId, productId: id, stock });
}

async function assertCategoryExists(categoryId: string) {
  const exists = await db.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!exists) throw new AdminInputError("Choose a valid category.");
}
