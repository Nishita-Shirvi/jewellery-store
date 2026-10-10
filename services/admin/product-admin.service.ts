import "server-only";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { slugify, type ProductFormInput } from "@/lib/validation/admin";
import { CATALOG_TAG } from "@/services/catalog.service";

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
    const clash = await db.product.findFirst({
      where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${i}`;
  }
  throw new Error("Could not create a unique slug");
}

function toData(input: ProductFormInput) {
  return {
    name: input.name,
    description: input.description,
    priceInPaise: input.price,
    makingChargeInPaise: input.makingCharge,
    stock: input.stock,
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
    category: { connect: { id: input.categoryId } },
  };
}

export class AdminInputError extends Error {}

export async function createProduct(input: ProductFormInput, adminId: string) {
  await assertCategoryExists(input.categoryId);
  const slug = await uniqueSlug(input.slug ?? slugify(input.name));
  const product = await db.product.create({
    data: { ...toData(input), slug },
    select: { id: true, slug: true },
  });
  revalidateTag(CATALOG_TAG);
  logger.info("admin.product_created", { adminId, productId: product.id });
  return product;
}

export async function updateProduct(id: string, input: ProductFormInput, adminId: string) {
  await assertCategoryExists(input.categoryId);
  const slug = input.slug ? await uniqueSlug(input.slug, id) : undefined;
  try {
    const product = await db.product.update({
      where: { id },
      data: { ...toData(input), ...(slug ? { slug } : {}) },
      select: { id: true, slug: true },
    });
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

export async function setProductStock(id: string, stock: number, adminId: string) {
  const result = await db.product.updateMany({ where: { id }, data: { stock } });
  if (result.count === 0) throw new AdminInputError("Product not found.");
  revalidateTag(CATALOG_TAG);
  logger.info("admin.product_stock_changed", { adminId, productId: id, stock });
}

async function assertCategoryExists(categoryId: string) {
  const exists = await db.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!exists) throw new AdminInputError("Choose a valid category.");
}
