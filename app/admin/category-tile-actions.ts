"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth-guards";
import type { CategoryTile } from "@/lib/tiles";
import { categoryTileSchema } from "@/lib/validation/tiles";
import { AdminInputError } from "@/services/admin/product-admin.service";
import { saveCategoryTile } from "@/services/admin/category-admin.service";
import { audit } from "@/services/audit.service";
import { UploadError, uploadImage } from "@/services/upload.service";

/** Admin → Categories → Tile. Every action re-checks the "products.edit" permission. */

const categoryId = z.string().regex(/^[a-z0-9]{1,40}$/i);

export type TileSaveResult =
  | { ok: true; tile: CategoryTile | null }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Saves the tile, or `null` to go back to the sample tile for the category's name. */
export async function saveCategoryTileAction(
  id: string,
  input: unknown,
  name = "",
): Promise<TileSaveResult> {
  const admin = await requirePermission("products.edit");
  if (!categoryId.safeParse(id).success) return { ok: false, error: "Category not found." };
  let tile: CategoryTile | null = null;
  if (input !== null) {
    const parsed = categoryTileSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
    }
    tile = parsed.data as CategoryTile;
  }
  try {
    await saveCategoryTile(id, tile, admin.id);
  } catch (error) {
    if (error instanceof AdminInputError) return { ok: false, error: error.message };
    throw error;
  }
  await audit(admin, {
    action: "category.update",
    entityType: "category",
    entityId: id,
    summary: tile
      ? `Updated the home-page tile${name ? ` of ${name.slice(0, 80)}` : ""}`
      : `Reset the home-page tile${name ? ` of ${name.slice(0, 80)}` : ""}`,
  });
  revalidatePath("/admin/categories");
  revalidatePath("/");
  return { ok: true, tile };
}

/** Tile pictures: the cut-out of the piece, the hover photo and the model photo. */
export async function uploadTileImageAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = await requirePermission("products.edit");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image file." };
  try {
    const url = await uploadImage(file, "jewellery-store/tiles");
    await audit(admin, {
      action: "category.tile_upload",
      entityType: "category",
      entityId: "upload",
      summary: `Uploaded a category tile picture (${file.name.slice(0, 80)})`,
    });
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: error instanceof UploadError ? error.message : "Upload failed." };
  }
}
