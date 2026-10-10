"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guards";
import { logger } from "@/lib/logger";
import {
  categoryFormSchema,
  idSchema,
  orderStatusUpdateSchema,
  productFormSchema,
  stockUpdateSchema,
} from "@/lib/validation/admin";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/services/admin/category-admin.service";
import { updateOrderStatus } from "@/services/admin/order-admin.service";
import {
  AdminInputError,
  createProduct,
  setProductActive,
  setProductStock,
  updateProduct,
} from "@/services/admin/product-admin.service";
import { UploadError, uploadProductImage } from "@/services/upload.service";
import { ShipmentError, createShipmentForOrder } from "@/services/shipment.service";

/**
 * Every admin action starts with requireAdmin(), which re-reads the role from the database.
 * A customer calling these directly gets a 403 error and nothing changes.
 */

export interface AdminFormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

function fail(error: unknown): AdminFormState {
  if (error instanceof AdminInputError) return { error: error.message };
  logger.error("admin.action_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return { error: "Something went wrong. Please try again." };
}

// ── Products ─────────────────────────────────────────────

export async function saveProductAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const parsed = productFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };

  const id = formData.get("id");
  let savedId: string;
  try {
    if (typeof id === "string" && id) {
      if (!idSchema.safeParse({ id }).success) return { error: "Invalid product." };
      savedId = (await updateProduct(id, parsed.data, admin.id)).id;
    } else {
      savedId = (await createProduct(parsed.data, admin.id)).id;
    }
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/products");
  if (typeof id === "string" && id) return { ok: true, message: "Saved." };
  redirect(`/admin/products/${savedId}?created=1`);
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  await setProductActive(parsed.data.id, formData.get("isActive") === "true", admin.id);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${parsed.data.id}`);
}

export async function updateStockAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = stockUpdateSchema.safeParse({
    id: formData.get("id"),
    stock: formData.get("stock"),
  });
  if (!parsed.success) return;
  await setProductStock(parsed.data.id, parsed.data.stock, admin.id);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}

export async function uploadImageAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image file." };
  try {
    return { ok: true, url: await uploadProductImage(file) };
  } catch (error) {
    return { ok: false, error: error instanceof UploadError ? error.message : "Upload failed." };
  }
}

// ── Categories ───────────────────────────────────────────

export async function saveCategoryAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const parsed = categoryFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  const id = formData.get("id");
  try {
    if (typeof id === "string" && id) await updateCategory(id, parsed.data, admin.id);
    else await createCategory(parsed.data, admin.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/categories");
  return { ok: true, message: "Saved." };
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  try {
    await deleteCategory(parsed.data.id, admin.id);
  } catch (error) {
    if (error instanceof AdminInputError) {
      redirect(`/admin/categories?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath("/admin/categories");
}

// ── Orders ───────────────────────────────────────────────

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = orderStatusUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;
  try {
    await updateOrderStatus(parsed.data.id, parsed.data.status, admin.id);
  } catch (error) {
    if (error instanceof AdminInputError) {
      redirect(`/admin/orders/${parsed.data.id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
}

// ── Shipping ─────────────────────────────────────────────

export async function createShipmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  try {
    await createShipmentForOrder(parsed.data.id, admin.id);
  } catch (error) {
    if (error instanceof ShipmentError) {
      redirect(`/admin/orders/${parsed.data.id}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath(`/admin/orders/${parsed.data.id}`);
  redirect(`/admin/orders/${parsed.data.id}?shipped=1`);
}
