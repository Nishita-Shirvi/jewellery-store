import "server-only";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CategoryTile } from "@/lib/tiles";
import { logger } from "@/lib/logger";
import { slugify, type CategoryFormInput } from "@/lib/validation/admin";
import { AdminInputError } from "@/services/admin/product-admin.service";
import { CATALOG_TAG } from "@/services/catalog.service";
import { reindexSearchText } from "@/services/search.service";

export async function listCategoriesAdmin() {
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

/** Categories and collections (Phase 24) share /collections/<slug>, so neither may reuse the other's. */
async function slugTaken(slug: string, excludeId?: string) {
  const [category, collection] = await Promise.all([
    db.category.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    }),
    db.collection.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  return Boolean(category || collection);
}

export async function createCategory(input: CategoryFormInput, adminId: string) {
  const slug = input.slug ?? slugify(input.name);
  if (await slugTaken(slug)) throw new AdminInputError(`The URL name "${slug}" is already used.`);
  const category = await db.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  revalidateTag(CATALOG_TAG);
  logger.info("admin.category_created", { adminId, categoryId: category.id });
  return category;
}

export async function updateCategory(id: string, input: CategoryFormInput, adminId: string) {
  // A blank URL name keeps the current one: renaming must not silently break /collections links.
  const current = await db.category.findUnique({ where: { id }, select: { slug: true } });
  if (!current) throw new AdminInputError("Category not found.");
  const slug = input.slug ?? current.slug;
  if (await slugTaken(slug, id))
    throw new AdminInputError(`The URL name "${slug}" is already used.`);
  const result = await db.category.updateMany({
    where: { id },
    data: {
      name: input.name,
      slug,
      ...(input.description !== undefined ? { description: input.description } : {}),
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  if (result.count === 0) throw new AdminInputError("Category not found.");
  await reindexSearchText({ categoryId: id }); // category name is part of the search words
  revalidateTag(CATALOG_TAG);
  logger.info("admin.category_updated", { adminId, categoryId: id });
}

/** Only empty categories can be deleted; otherwise hide them (isActive = false). */
export async function deleteCategory(id: string, adminId: string) {
  const count = await db.product.count({ where: { categoryId: id } });
  if (count > 0) {
    throw new AdminInputError(
      `This category has ${count} product(s). Move them or hide the category instead.`,
    );
  }
  const result = await db.category.deleteMany({ where: { id } });
  if (result.count === 0) throw new AdminInputError("Category not found.");
  revalidateTag(CATALOG_TAG);
  logger.info("admin.category_deleted", { adminId, categoryId: id });
}

/**
 * The category's home-page tile (Admin → Categories → Tile). null = back to the sample tile
 * for its name (or the plain photo). The tile must already be validated (categoryTileSchema).
 */
export async function saveCategoryTile(
  id: string,
  tile: CategoryTile | null,
  adminId: string,
): Promise<{ name: string }> {
  const category = await db.category.findUnique({ where: { id }, select: { name: true } });
  if (!category) throw new AdminInputError("Category not found.");
  await db.category.update({
    where: { id },
    data: { tile: tile === null ? Prisma.DbNull : (tile as unknown as Prisma.InputJsonObject) },
  });
  revalidateTag(CATALOG_TAG);
  logger.info("admin.category_tile_saved", { adminId, categoryId: id, reset: tile === null });
  return category;
}

/** id + name for dropdowns. */
export async function listCategoryOptions() {
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}
