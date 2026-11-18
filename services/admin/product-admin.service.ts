import "server-only";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { slugify, type ProductFormInput } from "@/lib/validation/admin";
import { config } from "@/lib/config";
import { CATALOG_TAG } from "@/services/catalog.service";
import { RateError, priceForSave } from "@/services/metal-rate.service";
import { reindexSearchText } from "@/services/search.service";

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
        _count: { select: { orderItems: true } },
      },
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getProductAdmin(id: string) {
  return db.product.findUnique({ where: { id } });
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

async function priceFor(input: ProductFormInput): Promise<number> {
  try {
    return await priceForSave({
      pricingMode: input.pricingMode,
      typedPriceInPaise: input.price || null,
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

/** Everything on the form except stock (stock is written separately, see updateProduct). */
function toData(input: ProductFormInput, priceInPaise: number) {
  return {
    name: input.name,
    description: input.description,
    priceInPaise,
    pricingMode: input.pricingMode,
    makingChargeInPaise: input.makingCharge,
    stoneChargeInPaise: input.stoneCharge,
    occasions: input.occasions,
    sizes: input.sizes,
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
  const product = await db.product.create({
    data: { ...toData(input, await priceFor(input)), stock: input.stock, slug },
    select: { id: true, slug: true },
  });
  await reindexSearchText({ productId: product.id });
  revalidateTag(CATALOG_TAG);
  logger.info("admin.product_created", { adminId, productId: product.id });
  return product;
}

/**
 * Saves the edit form. Stock is only written when the admin changed it, and only if nobody bought
 * a piece since the form was opened — otherwise a sale made meanwhile would be silently undone.
 * A changed slug keeps the old one in previousSlugs so old links redirect.
 */
export async function updateProduct(id: string, input: ProductFormInput, adminId: string) {
  await assertCategoryExists(input.categoryId);
  const current = await db.product.findUnique({
    where: { id },
    select: { slug: true, previousSlugs: true, stock: true },
  });
  if (!current) throw new AdminInputError("Product not found.");
  const slug =
    input.slug && input.slug !== current.slug ? await uniqueSlug(input.slug, id) : undefined;
  const price = await priceFor(input);
  const stockChanged = input.stockOriginal === undefined || input.stock !== input.stockOriginal;
  try {
    const product = await db.$transaction(async (tx) => {
      if (stockChanged) {
        const updated = await tx.product.updateMany({
          where: {
            id,
            ...(input.stockOriginal !== undefined ? { stock: input.stockOriginal } : {}),
          },
          data: { stock: input.stock },
        });
        if (updated.count === 0) {
          const now = await tx.product.findUnique({ where: { id }, select: { stock: true } });
          throw new AdminInputError(
            `Stock changed while you were editing (now ${now?.stock ?? "unknown"}). Reload the page and try again.`,
          );
        }
      }
      return tx.product.update({
        where: { id },
        data: {
          ...toData(input, price),
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
    });
    await reindexSearchText({ productId: id });
    revalidateTag(CATALOG_TAG);
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

export async function setProductStock(
  id: string,
  stock: number,
  adminId: string,
  expected?: number,
) {
  const result = await db.product.updateMany({
    where: { id, ...(expected !== undefined ? { stock: expected } : {}) },
    data: { stock },
  });
  if (result.count === 0) {
    throw new AdminInputError(
      expected !== undefined
        ? "Stock changed since the page loaded (a sale?). The list now shows the current stock."
        : "Product not found.",
    );
  }
  revalidateTag(CATALOG_TAG);
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
