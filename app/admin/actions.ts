"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
import { ReturnError, approveReturn, rejectReturn } from "@/services/return.service";
import { retryRefund } from "@/services/refund.service";
import { createInvoiceForOrder } from "@/services/invoice.service";
import { saveCoupon, setCouponActive } from "@/services/admin/coupon-admin.service";
import { couponFormSchema } from "@/lib/validation/admin";

/**
 * Every admin action starts with requireAdmin(), which re-reads the role from the database.
 * A customer calling these directly gets a 403 error and nothing changes.
 */

export interface AdminFormState {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** What the admin typed, sent back so the form keeps it after an error. */
  values?: Record<string, string>;
}

function typedValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries())
    if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
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
    return { ...fail(error), values: typedValues(formData) };
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

// ── Returns and refunds ──────────────────────────────────

const returnDecisionSchema = z.object({
  returnId: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+$/i),
  orderId: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+$/i),
  note: z.string().trim().max(500).optional(),
});

export async function approveReturnAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = returnDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    await approveReturn(parsed.data.returnId, admin.id, {
      restock: formData.get("restock") === "on",
      note: parsed.data.note,
    });
  } catch (error) {
    if (error instanceof ReturnError)
      redirect(`/admin/orders/${parsed.data.orderId}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/returns");
}

export async function rejectReturnAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = returnDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  if (!parsed.data.note)
    redirect(
      `/admin/orders/${parsed.data.orderId}?error=${encodeURIComponent("Add a short reason for the customer before rejecting.")}`,
    );
  try {
    await rejectReturn(parsed.data.returnId, admin.id, parsed.data.note);
  } catch (error) {
    if (error instanceof ReturnError)
      redirect(`/admin/orders/${parsed.data.orderId}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/returns");
}

export async function retryRefundAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      refundId: z.string().regex(/^[a-z0-9]{1,40}$/i),
      orderId: z.string().regex(/^[a-z0-9]{1,40}$/i),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await retryRefund(parsed.data.refundId, admin.id);
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
}

// ── Invoices ─────────────────────────────────────────────

export async function generateInvoiceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const invoice = await createInvoiceForOrder(parsed.data.id);
  if (!invoice)
    redirect(
      `/admin/orders/${parsed.data.id}?error=${encodeURIComponent("Couldn't create the invoice (is the order paid?). Check the logs.")}`,
    );
  revalidatePath(`/admin/orders/${parsed.data.id}`);
}

// ── Coupons ──────────────────────────────────────────────

export async function saveCouponAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireAdmin();
  const parsed = couponFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  const id = formData.get("id");
  let savedId: string;
  try {
    savedId = (await saveCoupon(typeof id === "string" && id ? id : null, parsed.data, admin.id))
      .id;
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/coupons");
  if (typeof id === "string" && id) return { ok: true, message: "Saved." };
  redirect(`/admin/coupons/${savedId}?created=1`);
}

export async function toggleCouponAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  await setCouponActive(parsed.data.id, formData.get("isActive") === "true", admin.id);
  revalidatePath("/admin/coupons");
}
