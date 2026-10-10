import "server-only";
import { revalidateTag } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { slugify, type CategoryFormInput } from "@/lib/validation/admin";
import { AdminInputError } from "@/services/admin/product-admin.service";
import { CATALOG_TAG } from "@/services/catalog.service";

export async function listCategoriesAdmin() {
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

async function slugTaken(slug: string, excludeId?: string) {
  return Boolean(
    await db.category.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    }),
  );
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
  const slug = input.slug ?? slugify(input.name);
  if (await slugTaken(slug, id))
    throw new AdminInputError(`The URL name "${slug}" is already used.`);
  const result = await db.category.updateMany({
    where: { id },
    data: {
      name: input.name,
      slug,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
  if (result.count === 0) throw new AdminInputError("Category not found.");
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

/** id + name for dropdowns. */
export async function listCategoryOptions() {
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}
