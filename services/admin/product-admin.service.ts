import "server-only";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { slugify, type ProductFormInput } from "@/lib/validation/admin";
import { config } from "@/lib/config";
import { CATALOG_TAG } from "@/services/catalog.service";
import { RateError, rateLinkedStartPrice, repriceProduct } from "@/services/metal-rate.service";
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
    ...(query.status === "low" ? { stock: { lte: config.inventory.low_stock_threshold } } : {}),
    ...(query.status === "rate" ? { pricingMode: "RATE_LINKED" as const } : {}),
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
        pricingMode: true,
        images: true,
        category: { select: { name: true } },
        _count: {
          select: { options: true, orderItems: true, variants: { where: { isActive: true } } },
        },
      },
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getProductAdmin(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: { _count: { select: { options: true, orderItems: true } } },
  });
  if (!product) return null;
  const { _count, ...rest } = product;
  return { ...rest, hasOptions: _count.options > 0, orderCount: _count.orderItems };
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    // Also avoid another product's old slug: that link redirects to it.
    const clash = await db.product.findFirst({
      where: {
        OR: [{ slug: candidate }, { previousSlugs: { has: candidate } }],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error("Could not create a unique slug");
}

/**
 * The base variant's price from the form. FIXED: the typed price. RATE_LINKED: worked out from
 * today's rate (and refused when there is no rate for the purity yet).
 */
async function basePrice(input: ProductFormInput): Promise<number> {
  if (input.pricingMode === "FIXED") return input.price;
  try {
    return await rateLinkedStartPrice({
      purity: input.purity,
      netWeightMg: input.netWeight ?? 0,
      makingChargeInPaise: input.makingCharge,
      stoneChargeInPaise: input.stoneCharge,
      gstRateBps: input.gstRate,
    });
  } catch (error) {
    if (error instanceof RateError) throw new AdminInputError(error.message);
    throw error;
  }
}

/** Product fields from the form. Price/stock are summaries of the variants (synced separately). */
function toData(input: ProductFormInput) {
  return {
    name: input.name,
    description: input.description,
    pricingMode: input.pricingMode,
    makingChargeInPaise: input.makingCharge,
    stoneChargeInPaise: input.stoneCharge,
    spinVideoUrl: input.spinVideoUrl,
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
    countryOfOrigin: input.countryOfOrigin,
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
  const price = await basePrice(input);
  let product: { id: string; slug: string };
  try {
    product = await db.product.create({
      data: {
        ...toData(input),
        slug,
        priceInPaise: price,
        stock: input.stock,
        // Every product is sold through a variant; a new product starts with one base variant.
        variants: {
          create: {
            sku: slug.toUpperCase().slice(0, 80).replace(/-+$/, ""),
            priceInPaise: price,
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
  await reindexSearchText({ productId: product.id });
  revalidateTag(CATALOG_TAG);
  logger.info("admin.product_created", { adminId, productId: product.id });
  return product;
}

/**
 * Saves the edit form. A changed slug keeps the old one in previousSlugs so old links redirect.
 * Rate-linked products get every variant repriced from today's rate in the same transaction.
 */
export async function updateProduct(id: string, input: ProductFormInput, adminId: string) {
  await assertCategoryExists(input.categoryId);
  const current = await db.product.findUnique({
    where: { id },
    select: { slug: true, previousSlugs: true },
  });
  if (!current) throw new AdminInputError("Product not found.");
  const slug =
    input.slug && input.slug !== current.slug ? await uniqueSlug(input.slug, id) : undefined;
  // With options, each variant is priced from its own weight/purity (repriceProduct below); the
  // form's base price isn't used, so don't demand a rate for the product's own purity.
  const withOptions = (await db.productOption.count({ where: { productId: id } })) > 0;
  const price = withOptions ? input.price : await basePrice(input);
  try {
    const product = await db.$transaction(async (tx) => {
      const hasOptions = (await tx.productOption.count({ where: { productId: id } })) > 0;
      if (!hasOptions) {
        // No options: the form's price/stock/weight belong to the single base variant.
        // Variant row first, then the product row (same lock order as checkout).
        await updateBaseVariant(tx, id, {
          priceInPaise: price,
          stock: input.stock,
          stockOriginal: input.stockOriginal,
          netWeightMg: input.netWeight ?? 0,
          grossWeightMg: input.grossWeight ?? null,
        });
      }
      const saved = await tx.product.update({
        where: { id },
        data: {
          ...toData(input),
          ...(slug
            ? {
                slug,
                previousSlugs: [
                  ...current.previousSlugs.filter((s) => s !== slug),
                  current.slug,
                ].slice(-20),
              }
            : {}),
        },
        select: { id: true, slug: true },
      });
      if (input.pricingMode === "RATE_LINKED") await repriceProduct(tx, id);
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
 *
 * Stock is only written when the admin changed it (stock ≠ stockOriginal), and only if it still
 * equals stockOriginal: otherwise a sale made while the form was open would be silently undone.
 */
async function updateBaseVariant(
  tx: Prisma.TransactionClient,
  productId: string,
  data: {
    priceInPaise: number;
    stock: number;
    stockOriginal?: number;
    netWeightMg: number;
    grossWeightMg: number | null;
  },
) {
  const base = await tx.productVariant.findFirst({
    where: { productId, optionKey: "" },
    select: { id: true, reservedStock: true },
  });
  if (!base) throw new AdminInputError("Product not found.");
  const writeStock = data.stockOriginal === undefined || data.stock !== data.stockOriginal;
  const expected = data.stockOriginal ?? null;
  const updated = await tx.$executeRaw`
    UPDATE "ProductVariant" SET
      "priceInPaise" = ${data.priceInPaise},
      "stock" = CASE WHEN ${writeStock} THEN ${data.stock} ELSE "stock" END,
      "netWeightMg" = ${data.netWeightMg},
      "grossWeightMg" = ${data.grossWeightMg}::int,
      "updatedAt" = NOW()
    WHERE "id" = ${base.id}
      AND (NOT ${writeStock} OR "reservedStock" <= ${data.stock})
      AND (NOT ${writeStock} OR ${expected}::int IS NULL OR "stock" = ${expected}::int)`;
  if (updated === 0) {
    const now = await tx.productVariant.findUnique({
      where: { id: base.id },
      select: { stock: true, reservedStock: true },
    });
    if (expected !== null && now && now.stock !== expected)
      throw new AdminInputError(
        `Stock changed while you were editing (now ${now.stock}). Reload the page and try again.`,
      );
    throw new AdminInputError(
      `Stock can't go below the units held in checkouts right now (${now?.reservedStock ?? base.reservedStock}).`,
    );
  }
}

/** Quick stock edit from the product list. `expected` = stock shown when the list loaded. */
export async function setProductStock(
  id: string,
  stock: number,
  adminId: string,
  expected?: number,
) {
  await db.$transaction(async (tx) => {
    if ((await tx.productOption.count({ where: { productId: id } })) > 0)
      throw new AdminInputError("This piece has options — set stock per variant.");
    const base = await tx.productVariant.findFirst({
      where: { productId: id, optionKey: "" },
      select: { id: true, reservedStock: true },
    });
    if (!base) throw new AdminInputError("Product not found.");
    const want = expected ?? null;
    const updated = await tx.$executeRaw`
      UPDATE "ProductVariant" SET "stock" = ${stock}, "updatedAt" = NOW()
      WHERE "id" = ${base.id} AND "reservedStock" <= ${stock}
        AND (${want}::int IS NULL OR "stock" = ${want}::int)`;
    if (updated === 0) {
      const now = await tx.productVariant.findUnique({
        where: { id: base.id },
        select: { stock: true },
      });
      throw new AdminInputError(
        want !== null && now && now.stock !== want
          ? "Stock changed since the page loaded (a sale?). The list now shows the current stock."
          : `Stock can't go below the units held in checkouts right now (${base.reservedStock}).`,
      );
    }
    await syncProductSummaries(tx, [id]);
  });
  revalidateTag(CATALOG_TAG);
  await nudgeStockAlerts();
  logger.info("admin.product_stock_changed", { adminId, productId: id, stock });
}

/**
 * Permanently deletes a product that was never ordered (a mistake or a test piece). Products with
 * orders must stay — invoices, returns and reports point at them — so those can only be hidden.
 */
export async function deleteProduct(id: string, adminId: string): Promise<{ name: string }> {
  const product = await db.product.findUnique({
    where: { id },
    select: { name: true, _count: { select: { orderItems: true } } },
  });
  if (!product) throw new AdminInputError("Product not found.");
  if (product._count.orderItems > 0) {
    throw new AdminInputError(
      "This piece has been ordered, so it can't be deleted (invoices and returns need it). Hide it instead.",
    );
  }
  try {
    await db.product.delete({ where: { id } });
  } catch (error) {
    // An order placed in the last instant: the Restrict rule refuses the delete.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new AdminInputError(
        "This piece was just ordered, so it can't be deleted. Hide it instead.",
      );
    }
    throw error;
  }
  revalidateTag(CATALOG_TAG);
  logger.info("admin.product_deleted", { adminId, productId: id });
  return { name: product.name };
}

async function assertCategoryExists(categoryId: string) {
  const exists = await db.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!exists) throw new AdminInputError("Choose a valid category.");
}
