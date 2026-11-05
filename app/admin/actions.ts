"use server";

import { revalidatePath } from "next/cache";
import { audit, diff } from "@/services/audit.service";
import { getProductAdmin } from "@/services/admin/product-admin.service";
import { z } from "zod";
import { redirect } from "next/navigation";
import { ForbiddenError, requirePermission } from "@/lib/auth-guards";
import { ROLE_KEYS, type RoleKey } from "@/lib/permissions";
import {
  StaffError,
  deactivateStaff,
  inviteStaff,
  reactivateStaff,
  resetTwoFactor,
  revokeInvite,
  setStaffRoles,
} from "@/services/staff.service";
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
import { ReturnError, approveReturn, rejectReturn } from "@/services/return.service";
import { markManualRefundPaid, retryRefund } from "@/services/refund.service";
import { markCashReceived } from "@/services/cod.service";
import {
  SupportError,
  assignTicket,
  deleteCannedReply,
  deleteFaq,
  readAttachments,
  saveCannedReply,
  saveFaq,
  setTicketStatus,
  staffReply,
} from "@/services/support.service";
import { enqueueAndRunNow, retryDeadJob } from "@/services/jobs.service";
import { createInvoiceForOrder } from "@/services/invoice.service";
import { saveCoupon, setCouponActive } from "@/services/admin/coupon-admin.service";
import { ReviewError, moderateReview } from "@/services/review.service";
import { couponFormSchema } from "@/lib/validation/admin";
import { evaluateAlerts } from "@/services/monitor.service";
import {
  announcementFormSchema,
  collectionFormSchema,
  contentPageFormSchema,
  homeSectionFormSchema,
  parseProductList,
} from "@/lib/validation/content";
import {
  ContentInputError,
  createStarterCollections,
  deleteAnnouncement,
  deleteCollection,
  deleteHomeSection,
  deletePage,
  publishPage,
  saveAnnouncement,
  saveCollection,
  saveHomeSection,
  savePageDraft,
  setCollectionProducts,
  unpublishPage,
} from "@/services/merch.service";
import { MAX_OPTIONS, optionsInputSchema, parseValueList } from "@/lib/variants";
import { parseGramsToMg, parseRupeesToPaise } from "@/lib/money";
import {
  bulkUpdateVariants,
  saveOptions,
  type VariantRowInput,
} from "@/services/admin/variant-admin.service";
import {
  MANUAL_UPDATE_LABEL,
  MANUAL_UPDATE_STATUSES,
  addManualUpdate,
  saveManualTracking,
} from "@/services/manual-shipping.service";

/**
 * Every admin action starts with requirePermission("…"): staff role, active status, two-step
 * sign-in and the permission are re-checked on every call. Anyone else calling these directly
 * gets a 403 (recorded in the activity log) and nothing changes.
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
  const admin = await requirePermission("products.edit");
  const parsed = productFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: typedValues(formData),
    };

  const id = formData.get("id");
  let savedId: string;
  try {
    if (typeof id === "string" && id) {
      if (!idSchema.safeParse({ id }).success) return { error: "Invalid product." };
      const before = await getProductAdmin(id);
      savedId = (await updateProduct(id, parsed.data, admin.id)).id;
      if (before) {
        const changes = diff(
          before as unknown as Record<string, unknown>,
          {
            name: parsed.data.name,
            priceInPaise: parsed.data.price,
            stock: parsed.data.stock,
            isActive: parsed.data.isActive,
            isFeatured: parsed.data.isFeatured,
            gstRateBps: parsed.data.gstRate,
            hsnCode: parsed.data.hsnCode,
            categoryId: parsed.data.categoryId,
          },
          [
            "name",
            "priceInPaise",
            "stock",
            "isActive",
            "isFeatured",
            "gstRateBps",
            "hsnCode",
            "categoryId",
          ],
        );
        await audit(admin, {
          action: "product.update",
          entityType: "product",
          entityId: id,
          summary: `Updated ${parsed.data.name}${Object.keys(changes).length ? ` (${Object.keys(changes).join(", ")})` : ""}`,
          changes,
        });
      }
    } else {
      savedId = (await createProduct(parsed.data, admin.id)).id;
      await audit(admin, {
        action: "product.create",
        entityType: "product",
        entityId: savedId,
        summary: `Created ${parsed.data.name}`,
      });
    }
  } catch (error) {
    return { ...fail(error), values: typedValues(formData) };
  }
  revalidatePath("/admin/products");
  if (typeof id === "string" && id) return { ok: true, message: "Saved." };
  redirect(`/admin/products/${savedId}?created=1`);
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products.edit");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const isActive = formData.get("isActive") === "true";
  await setProductActive(parsed.data.id, isActive, admin.id);
  await audit(admin, {
    action: isActive ? "product.show" : "product.hide",
    entityType: "product",
    entityId: parsed.data.id,
    summary: isActive ? "Product shown in store" : "Product hidden from store",
    changes: { isActive: { from: !isActive, to: isActive } },
  });
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${parsed.data.id}`);
}

export async function updateStockAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products.edit");
  const parsed = stockUpdateSchema.safeParse({
    id: formData.get("id"),
    stock: formData.get("stock"),
  });
  if (!parsed.success) return;
  const beforeStock = (await getProductAdmin(parsed.data.id))?.stock;
  try {
    await setProductStock(parsed.data.id, parsed.data.stock, admin.id);
  } catch (error) {
    // Refused (piece has options, or stock below units held in checkouts): nothing changed.
    if (error instanceof AdminInputError) {
      logger.warn("admin.stock_update_refused", {
        productId: parsed.data.id,
        reason: error.message,
      });
      redirect(`/admin/products?stockError=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  await audit(admin, {
    action: "product.stock",
    entityType: "product",
    entityId: parsed.data.id,
    summary: `Stock set to ${parsed.data.stock}`,
    changes: { stock: { from: beforeStock, to: parsed.data.stock } },
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}

export async function uploadImageAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = await requirePermission("products.edit");
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose an image file." };
  try {
    const url = await uploadProductImage(file);
    await audit(admin, {
      action: "product.image_upload",
      entityType: "product",
      entityId: "upload",
      summary: `Uploaded a product photo (${file.name.slice(0, 80)})`,
    });
    return { ok: true, url };
  } catch (error) {
    return { ok: false, error: error instanceof UploadError ? error.message : "Upload failed." };
  }
}

// ── Categories ───────────────────────────────────────────

export async function saveCategoryAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePermission("products.edit");
  const parsed = categoryFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: typedValues(formData),
    };
  const id = formData.get("id");
  try {
    if (typeof id === "string" && id) {
      await updateCategory(id, parsed.data, admin.id);
      await audit(admin, {
        action: "category.update",
        entityType: "category",
        entityId: id,
        summary: `Updated category ${parsed.data.name}`,
      });
    } else {
      const created = await createCategory(parsed.data, admin.id);
      await audit(admin, {
        action: "category.create",
        entityType: "category",
        entityId: created.id,
        summary: `Created category ${parsed.data.name}`,
      });
    }
  } catch (error) {
    return { ...fail(error), values: typedValues(formData) };
  }
  revalidatePath("/admin/categories");
  return { ok: true, message: "Saved." };
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("products.edit");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  try {
    await deleteCategory(parsed.data.id, admin.id);
    await audit(admin, {
      action: "category.delete",
      entityType: "category",
      entityId: parsed.data.id,
      summary: "Deleted category",
    });
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
  const admin = await requirePermission("orders.update");
  const parsed = orderStatusUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;
  // Cancelling a paid order refunds it: that needs the refunds permission too.
  if (parsed.data.status === "CANCELLED" && !admin.permissions.includes("refunds.manage"))
    throw new ForbiddenError();
  try {
    await updateOrderStatus(parsed.data.id, parsed.data.status, admin.id);
    await audit(admin, {
      action: "order.status",
      entityType: "order",
      entityId: parsed.data.id,
      summary: `Order status → ${parsed.data.status}`,
    });
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
  const admin = await requirePermission("orders.update");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const orderId = parsed.data.id;
  // Runs as a background job (retried automatically if Shiprocket fails), but right away so
  // the admin sees the result. A double click can't create two parcels.
  const { outcome, error } = await enqueueAndRunNow(
    "shipment.create",
    { orderId, adminId: admin.id },
    `shipment:${orderId}`,
  );
  await audit(admin, {
    action: "shipment.create",
    entityType: "order",
    entityId: orderId,
    summary:
      outcome === "done"
        ? "Shipment created with Shiprocket"
        : `Shipment not created yet (${outcome})`,
  });
  revalidatePath(`/admin/orders/${orderId}`);
  if (outcome === "done") redirect(`/admin/orders/${orderId}?shipped=1`);
  const message =
    outcome === "busy"
      ? "The shipment is already being created. Refresh in a moment."
      : outcome === "retry"
        ? `${error ?? "Shiprocket failed"} — it will be retried automatically (Admin → Jobs).`
        : (error ?? "The shipment couldn't be created.");
  redirect(`/admin/orders/${orderId}?error=${encodeURIComponent(message.slice(0, 300))}`);
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
  const admin = await requirePermission("refunds.manage");
  const parsed = returnDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    await approveReturn(parsed.data.returnId, admin.id, {
      restock: formData.get("restock") === "on",
      note: parsed.data.note,
    });
    await audit(admin, {
      action: "return.approve",
      entityType: "return",
      entityId: parsed.data.returnId,
      summary: `Return approved${formData.get("restock") === "on" ? " (restocked)" : ""}`,
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
  const admin = await requirePermission("refunds.manage");
  const parsed = returnDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  if (!parsed.data.note)
    redirect(
      `/admin/orders/${parsed.data.orderId}?error=${encodeURIComponent("Add a short reason for the customer before rejecting.")}`,
    );
  try {
    await rejectReturn(parsed.data.returnId, admin.id, parsed.data.note);
    await audit(admin, {
      action: "return.reject",
      entityType: "order",
      entityId: parsed.data.orderId,
      summary: `Return rejected: ${parsed.data.note}`,
    });
  } catch (error) {
    if (error instanceof ReturnError)
      redirect(`/admin/orders/${parsed.data.orderId}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/returns");
}

export async function retryRefundAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("refunds.manage");
  const parsed = z
    .object({
      refundId: z.string().regex(/^[a-z0-9]{1,40}$/i),
      orderId: z.string().regex(/^[a-z0-9]{1,40}$/i),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const outcome = await retryRefund(parsed.data.refundId, admin.id);
  await audit(admin, {
    action: "refund.retry",
    entityType: "refund",
    entityId: parsed.data.refundId,
    summary: `Refund retried (${outcome})`,
  });
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
}

// ── Invoices ─────────────────────────────────────────────

export async function generateInvoiceAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("orders.update");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  const invoice = await createInvoiceForOrder(parsed.data.id);
  if (invoice)
    await audit(admin, {
      action: "invoice.generate",
      entityType: "order",
      entityId: parsed.data.id,
      summary: `Invoice ${invoice.number} generated`,
    });
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
  const admin = await requirePermission("coupons.manage");
  const parsed = couponFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: typedValues(formData),
    };
  const id = formData.get("id");
  let savedId: string;
  try {
    savedId = (await saveCoupon(typeof id === "string" && id ? id : null, parsed.data, admin.id))
      .id;
    await audit(admin, {
      action: typeof id === "string" && id ? "coupon.update" : "coupon.create",
      entityType: "coupon",
      entityId: savedId,
      summary: `${typeof id === "string" && id ? "Updated" : "Created"} coupon ${parsed.data.code}`,
    });
  } catch (error) {
    return { ...fail(error), values: typedValues(formData) };
  }
  revalidatePath("/admin/coupons");
  if (typeof id === "string" && id) return { ok: true, message: "Saved." };
  redirect(`/admin/coupons/${savedId}?created=1`);
}

export async function toggleCouponAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("coupons.manage");
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return;
  await setCouponActive(parsed.data.id, formData.get("isActive") === "true", admin.id);
  await audit(admin, {
    action: "coupon.toggle",
    entityType: "coupon",
    entityId: parsed.data.id,
    summary: formData.get("isActive") === "true" ? "Coupon turned on" : "Coupon turned off",
  });
  revalidatePath("/admin/coupons");
}

// ── Reviews ──────────────────────────────────────────────

export async function moderateReviewAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("reviews.moderate");
  const parsed = z
    .object({
      id: z.string().regex(/^[a-z0-9]{1,40}$/i),
      decision: z.enum(["APPROVED", "REJECTED"]),
      note: z.string().trim().max(300).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    await moderateReview(
      parsed.data.id,
      parsed.data.decision,
      admin.id,
      parsed.data.note || undefined,
    );
    await audit(admin, {
      action: parsed.data.decision === "APPROVED" ? "review.approve" : "review.reject",
      entityType: "review",
      entityId: parsed.data.id,
      summary: `Review ${parsed.data.decision === "APPROVED" ? "approved" : "rejected"}`,
    });
  } catch (error) {
    if (!(error instanceof ReviewError)) throw error;
  }
  revalidatePath("/admin/reviews");
}

// ── Product variants (Phase 17) ──────────────────────────

function readOptions(formData: FormData) {
  const options: { name: string; values: string[] }[] = [];
  for (let i = 0; i < MAX_OPTIONS; i++) {
    const name = String(formData.get(`option${i}Name`) ?? "").trim();
    const values = parseValueList(String(formData.get(`option${i}Values`) ?? ""));
    if (name || values.length) options.push({ name, values });
  }
  return options;
}

export async function saveVariantOptionsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePermission("products.edit");
  const id = idSchema.safeParse({ id: formData.get("productId") });
  if (!id.success) return { error: "Invalid product." };
  const parsed = optionsInputSchema.safeParse(readOptions(formData));
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Check the options.",
      values: typedValues(formData),
    };
  try {
    const result = await saveOptions(id.data.id, parsed.data, admin.id);
    await audit(admin, {
      action: "product.variants_options",
      entityType: "product",
      entityId: id.data.id,
      summary: `Options saved: ${parsed.data.map((o) => `${o.name} (${o.values.length})`).join(", ") || "none"}; ${result.created} variant(s) created, ${result.deactivated} switched off`,
    });
    revalidatePath(`/admin/products/${id.data.id}/variants`);
    revalidatePath("/admin/products");
    return {
      ok: true,
      message: `Saved. ${result.combinations} combination(s); ${result.created} new, ${result.deactivated} switched off.`,
    };
  } catch (error) {
    return { ...fail(error), values: typedValues(formData) };
  }
}

export async function saveVariantsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePermission("products.edit");
  const id = idSchema.safeParse({ id: formData.get("productId") });
  if (!id.success) return { error: "Invalid product." };
  const allPrice = String(formData.get("setAllPrice") ?? "").trim();
  const allStock = String(formData.get("setAllStock") ?? "").trim();

  const rows: VariantRowInput[] = [];
  for (const raw of formData.getAll("variantId")) {
    const vid = idSchema.safeParse({ id: raw });
    if (!vid.success) return { error: "Invalid variant." };
    const v = vid.data.id;
    const price = parseRupeesToPaise(allPrice || String(formData.get(`price_${v}`) ?? ""));
    const stockText = allStock || String(formData.get(`stock_${v}`) ?? "");
    const stock = /^\d{1,6}$/.test(stockText) ? Number(stockText) : null;
    const net = parseGramsToMg(String(formData.get(`net_${v}`) ?? ""));
    const grossText = String(formData.get(`gross_${v}`) ?? "").trim();
    const gross = grossText ? parseGramsToMg(grossText) : null;
    const sku = String(formData.get(`sku_${v}`) ?? "");
    if (price === null || price <= 0)
      return { error: `${sku || v}: enter a price in rupees`, values: typedValues(formData) };
    const compareText = String(formData.get(`compare_${v}`) ?? "").trim();
    const compareAt = compareText ? parseRupeesToPaise(compareText) : null;
    if (compareText && (compareAt === null || compareAt <= price))
      return {
        error: `${sku || v}: the "was" price must be higher than the price (or leave it empty)`,
        values: typedValues(formData),
      };
    if (stock === null || stock > 100000)
      return { error: `${sku || v}: stock must be a whole number`, values: typedValues(formData) };
    if (!net)
      return { error: `${sku || v}: enter the net weight in grams`, values: typedValues(formData) };
    if (grossText && !gross)
      return { error: `${sku || v}: gross weight must be in grams`, values: typedValues(formData) };
    rows.push({
      id: v,
      sku,
      priceInPaise: price,
      compareAtPriceInPaise: compareAt,
      stock,
      netWeightMg: net,
      grossWeightMg: gross,
      isActive: formData.get(`active_${v}`) === "on",
    });
  }
  try {
    const changes = await bulkUpdateVariants(id.data.id, rows, admin.id);
    if (Object.keys(changes).length)
      await audit(admin, {
        action: "product.variants_update",
        entityType: "product",
        entityId: id.data.id,
        summary: `Variants updated (${Object.keys(changes).length} change(s))`,
        changes,
      });
    revalidatePath(`/admin/products/${id.data.id}/variants`);
    revalidatePath("/admin/products");
    return { ok: true, message: "Variants saved." };
  } catch (error) {
    return { ...fail(error), values: typedValues(formData) };
  }
}

// ── Cash on delivery (Phase 18) ──────────────────────────

const idList = z
  .array(z.string().regex(/^[a-z0-9]{1,40}$/i))
  .min(1)
  .max(200);

/** Records cash received (remitted by the courier) for one or more delivered COD orders. */
export async function markCashReceivedAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("cod.manage");
  const ids = idList.safeParse(formData.getAll("orderId"));
  const reference = String(formData.get("reference") ?? "")
    .trim()
    .slice(0, 120);
  const back = String(formData.get("back") ?? "") === "order" ? "order" : "cod";
  if (!ids.success) redirect("/admin/cod?error=Choose%20at%20least%20one%20order");
  const result = await markCashReceived(ids.data, admin.id, reference || undefined);
  for (const orderId of ids.data)
    await audit(admin, {
      action: "order.cod_cash_received",
      entityType: "order",
      entityId: orderId,
      summary: `Cash on delivery recorded as received${reference ? ` (ref ${reference})` : ""}`,
    });
  revalidatePath("/admin/cod");
  revalidatePath("/admin/reports");
  if (back === "order") revalidatePath(`/admin/orders/${ids.data[0]}`);
  else redirect(`/admin/cod?recorded=${result.recorded}`);
}

/** A COD refund the store paid back by bank transfer / UPI. */
export async function markRefundPaidAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("refunds.manage");
  const parsed = z
    .object({
      refundId: z.string().regex(/^[a-z0-9]{1,40}$/i),
      orderId: z.string().regex(/^[a-z0-9]{1,40}$/i),
      reference: z.string().trim().min(3, { message: "Enter the bank / UPI reference" }).max(120),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const orderId = String(formData.get("orderId") ?? "").replace(/[^a-z0-9]/gi, "");
    redirect(
      `/admin/orders/${orderId}?error=${encodeURIComponent("Enter the bank / UPI reference of the refund.")}`,
    );
  }
  const outcome = await markManualRefundPaid(parsed.data.refundId, admin.id, parsed.data.reference);
  await audit(admin, {
    action: "refund.manual_paid",
    entityType: "refund",
    entityId: parsed.data.refundId,
    summary: `COD refund marked as paid (ref ${parsed.data.reference}): ${outcome}`,
  });
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
}

// ── Background jobs (Phase 19) ───────────────────────────

/** Puts a failed (DEAD) job back in the queue and runs the queue. */
export async function retryJobAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("jobs.manage");
  const ids = idList.safeParse(formData.getAll("jobId"));
  if (!ids.success) redirect("/admin/jobs");
  let retried = 0;
  for (const jobId of ids.data) if (await retryDeadJob(jobId)) retried++;
  await audit(admin, {
    action: "jobs.retry",
    entityType: "job",
    entityId: ids.data.length === 1 ? ids.data[0]! : "many",
    summary: `Retried ${retried} failed job(s)`,
  });
  const { runDueJobs } = await import("@/services/jobs.service");
  await runDueJobs({ limit: 20, budgetMs: 15_000 });
  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs?retried=${retried}`);
}

// ── Staff (Phase 21) ─────────────────────────────────────

const roleKeySchema = z.enum(ROLE_KEYS as [RoleKey, ...RoleKey[]]);
const staffTarget = z.object({ userId: z.string().regex(/^[a-z0-9]{1,40}$/i) });

function staffFail(error: unknown): never {
  if (error instanceof StaffError)
    redirect(`/admin/staff?error=${encodeURIComponent(error.message.slice(0, 200))}`);
  throw error;
}

export async function inviteStaffAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePermission("staff.manage");
  const parsed = z
    .object({ email: z.email({ message: "Enter a valid email" }).max(254), role: roleKeySchema })
    .safeParse({ email: String(formData.get("email") ?? "").trim(), role: formData.get("role") });
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message ?? "Check the form.",
      values: typedValues(formData),
    };
  try {
    const { inviteId, link } = await inviteStaff(parsed.data.email, parsed.data.role, admin.id);
    await audit(admin, {
      action: "staff.invite",
      entityType: "staff",
      entityId: inviteId,
      summary: `Invited ${parsed.data.email} as ${parsed.data.role}`,
    });
    revalidatePath("/admin/staff");
    return {
      ok: true,
      message: `Invitation emailed. You can also send this link yourself (valid 7 days): ${link}`,
    };
  } catch (error) {
    if (error instanceof StaffError) return { error: error.message, values: typedValues(formData) };
    throw error;
  }
}

export async function setStaffRolesAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("staff.manage");
  const target = staffTarget.safeParse({ userId: formData.get("userId") });
  const roles = z.array(roleKeySchema).max(5).safeParse(formData.getAll("roles"));
  if (!target.success || !roles.success) redirect("/admin/staff?error=Invalid%20request");
  try {
    await setStaffRoles(target.data.userId, roles.data, admin.id);
  } catch (error) {
    staffFail(error);
  }
  await audit(admin, {
    action: "staff.roles",
    entityType: "staff",
    entityId: target.data.userId,
    summary: `Roles set to ${roles.data.join(", ") || "none"}`,
  });
  revalidatePath("/admin/staff");
}

export async function deactivateStaffAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("staff.manage");
  const target = staffTarget.safeParse({ userId: formData.get("userId") });
  if (!target.success) redirect("/admin/staff?error=Invalid%20request");
  try {
    await deactivateStaff(target.data.userId, admin.id);
  } catch (error) {
    staffFail(error);
  }
  await audit(admin, {
    action: "staff.deactivate",
    entityType: "staff",
    entityId: target.data.userId,
    summary: "Staff member deactivated",
  });
  revalidatePath("/admin/staff");
}

export async function reactivateStaffAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("staff.manage");
  const target = staffTarget.safeParse({ userId: formData.get("userId") });
  if (!target.success) redirect("/admin/staff?error=Invalid%20request");
  try {
    await reactivateStaff(target.data.userId, admin.id);
  } catch (error) {
    staffFail(error);
  }
  await audit(admin, {
    action: "staff.reactivate",
    entityType: "staff",
    entityId: target.data.userId,
    summary: "Staff member reactivated",
  });
  revalidatePath("/admin/staff");
}

export async function resetStaffTwoFactorAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("staff.manage");
  const target = staffTarget.safeParse({ userId: formData.get("userId") });
  if (!target.success) redirect("/admin/staff?error=Invalid%20request");
  await resetTwoFactor(target.data.userId);
  await audit(admin, {
    action: "staff.2fa_reset",
    entityType: "staff",
    entityId: target.data.userId,
    summary: "Two-step sign-in reset (they set it up again at their next admin visit)",
  });
  revalidatePath("/admin/staff");
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("staff.manage");
  const id = idSchema.safeParse({ id: formData.get("inviteId") });
  if (!id.success) redirect("/admin/staff?error=Invalid%20request");
  await revokeInvite(id.data.id);
  await audit(admin, {
    action: "staff.invite_revoke",
    entityType: "staff",
    entityId: id.data.id,
    summary: "Invitation cancelled",
  });
  revalidatePath("/admin/staff");
}

// ── Customer support (Phase 22) ──────────────────────────

const ticketIdSchema = z.string().regex(/^[a-z0-9]{1,40}$/i);

function supportBack(ticketId: string, error?: string): never {
  redirect(
    `/admin/support/${ticketId}${error ? `?error=${encodeURIComponent(error.slice(0, 200))}` : ""}`,
  );
}

export async function staffReplyTicketAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("support.manage");
  const ticketId = ticketIdSchema.safeParse(formData.get("ticketId"));
  if (!ticketId.success) redirect("/admin/support");
  const internal = formData.get("internal") === "on";
  const resolve = formData.get("resolve") === "on" && !internal;
  try {
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    await staffReply(admin.id, ticketId.data, {
      body: String(formData.get("body") ?? ""),
      internal,
      resolve,
      files: await readAttachments(files),
    });
  } catch (error) {
    if (error instanceof SupportError) supportBack(ticketId.data, error.message);
    throw error;
  }
  await audit(admin, {
    action: internal ? "support.note" : resolve ? "support.reply_resolve" : "support.reply",
    entityType: "ticket",
    entityId: ticketId.data,
    summary: internal
      ? "Internal note added"
      : resolve
        ? "Replied and resolved"
        : "Replied to the customer",
  });
  revalidatePath(`/admin/support/${ticketId.data}`);
  supportBack(ticketId.data);
}

export async function assignTicketAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("support.manage");
  const ticketId = ticketIdSchema.safeParse(formData.get("ticketId"));
  if (!ticketId.success) redirect("/admin/support");
  const raw = String(formData.get("assigneeId") ?? "");
  const assignee =
    raw === "me" ? admin.id : raw ? (ticketIdSchema.safeParse(raw).data ?? "invalid") : null;
  try {
    await assignTicket(ticketId.data, assignee);
  } catch (error) {
    if (error instanceof SupportError) supportBack(ticketId.data, error.message);
    throw error;
  }
  await audit(admin, {
    action: "support.assign",
    entityType: "ticket",
    entityId: ticketId.data,
    summary: assignee
      ? `Assigned to ${assignee === admin.id ? "themselves" : assignee}`
      : "Unassigned",
  });
  revalidatePath(`/admin/support/${ticketId.data}`);
  supportBack(ticketId.data);
}

export async function setTicketStatusAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("support.manage");
  const ticketId = ticketIdSchema.safeParse(formData.get("ticketId"));
  const status = z.enum(["OPEN", "ANSWERED", "RESOLVED"]).safeParse(formData.get("ticketStatus"));
  if (!ticketId.success || !status.success) redirect("/admin/support");
  try {
    await setTicketStatus(ticketId.data, status.data);
  } catch (error) {
    if (error instanceof SupportError) supportBack(ticketId.data, error.message);
    throw error;
  }
  await audit(admin, {
    action: "support.status",
    entityType: "ticket",
    entityId: ticketId.data,
    summary: `Ticket status → ${status.data}`,
  });
  revalidatePath(`/admin/support/${ticketId.data}`);
  supportBack(ticketId.data);
}

const faqSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]{1,40}$/i)
    .optional(),
  question: z.string().trim().min(5, { message: "Write the question" }).max(200),
  answer: z.string().trim().min(5, { message: "Write the answer" }).max(4000),
  category: z.string().trim().min(2).max(40).default("General"),
  position: z.coerce.number().int().min(0).max(999).default(0),
  isPublished: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

export async function saveFaqAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("faqs.manage");
  const raw = Object.fromEntries(formData);
  const parsed = faqSchema.safeParse({ ...raw, id: raw.faqId || undefined });
  if (!parsed.success)
    redirect(
      `/admin/faqs?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`,
    );
  const saved = await saveFaq(parsed.data);
  await audit(admin, {
    action: parsed.data.id ? "faq.update" : "faq.create",
    entityType: "faq",
    entityId: saved.id,
    summary: `FAQ saved: ${parsed.data.question.slice(0, 80)}`,
  });
  revalidatePath("/admin/faqs");
  revalidatePath("/help");
}

export async function deleteFaqAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("faqs.manage");
  const id = ticketIdSchema.safeParse(formData.get("faqId"));
  if (!id.success) return;
  await deleteFaq(id.data);
  await audit(admin, {
    action: "faq.delete",
    entityType: "faq",
    entityId: id.data,
    summary: "FAQ deleted",
  });
  revalidatePath("/admin/faqs");
  revalidatePath("/help");
}

export async function saveCannedReplyAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("faqs.manage");
  const parsed = z
    .object({
      id: z
        .string()
        .regex(/^[a-z0-9]{1,40}$/i)
        .optional(),
      title: z.string().trim().min(2).max(80),
      body: z.string().trim().min(5).max(4000),
    })
    .safeParse({
      id: formData.get("cannedId") || undefined,
      title: formData.get("title"),
      body: formData.get("cannedBody"),
    });
  if (!parsed.success) redirect("/admin/faqs?error=Check%20the%20canned%20reply");
  const saved = await saveCannedReply(parsed.data);
  await audit(admin, {
    action: "canned.save",
    entityType: "faq",
    entityId: saved.id,
    summary: `Canned reply saved: ${parsed.data.title}`,
  });
  revalidatePath("/admin/faqs");
}

export async function deleteCannedReplyAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("faqs.manage");
  const id = ticketIdSchema.safeParse(formData.get("cannedId"));
  if (!id.success) return;
  await deleteCannedReply(id.data);
  await audit(admin, {
    action: "canned.delete",
    entityType: "faq",
    entityId: id.data,
    summary: "Canned reply deleted",
  });
  revalidatePath("/admin/faqs");
}

// ───────────────────────── Content: collections, homepage, announcements, pages (Phase 24) ─────

const contentIdSchema = z.string().regex(/^[a-z0-9]{1,40}$/i);
const optionalContentId = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v ? v : undefined;

/** Back to an admin page with a message (errors show as an alert, others as a notice). */
function backTo(path: string, params: { error?: string; saved?: string }): never {
  const [base, hash] = path.split("#");
  const q = new URLSearchParams(params as Record<string, string>).toString();
  redirect(`${base}?${q}${hash ? `#${hash}` : ""}`);
}

/** The content forms name their status "contentStatus" (it isn't an order status). */
function contentForm(formData: FormData, idField: string) {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  return {
    ...raw,
    id: optionalContentId(formData.get(idField)),
    status: raw.contentStatus,
  } as Record<string, string | undefined>;
}

function firstIssue(error: z.ZodError) {
  const i = error.issues[0];
  if (!i) return "Check the form";
  const field = i.path.join(".");
  return field ? `${field}: ${i.message}` : i.message;
}

export async function saveCollectionAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const parsed = collectionFormSchema.safeParse(contentForm(formData, "collectionId"));
  const editPath = (id?: string) => `/admin/content/collections/${id ?? "new"}`;
  if (!parsed.success)
    backTo(editPath(optionalContentId(formData.get("collectionId"))), {
      error: firstIssue(parsed.error),
    });
  let id: string;
  try {
    id = (await saveCollection(parsed.data)).id;
  } catch (error) {
    if (error instanceof ContentInputError)
      backTo(editPath(parsed.data.id), { error: error.message });
    throw error;
  }
  await audit(admin, {
    action: parsed.data.id ? "collection.update" : "collection.create",
    entityType: "collection",
    entityId: id,
    summary: `Collection ${parsed.data.title} (${parsed.data.status.toLowerCase()})`,
  });
  revalidatePath("/admin/content");
  backTo(editPath(id), { saved: "Collection saved." });
}

export async function setCollectionProductsAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const id = contentIdSchema.safeParse(formData.get("collectionId"));
  if (!id.success) backTo("/admin/content", { error: "Invalid collection." });
  const slugs = parseProductList(String(formData.get("productSlugs") ?? ""));
  let count: number;
  try {
    count = await setCollectionProducts(id.data, slugs);
  } catch (error) {
    if (error instanceof ContentInputError)
      backTo(`/admin/content/collections/${id.data}`, { error: error.message });
    throw error;
  }
  await audit(admin, {
    action: "collection.products",
    entityType: "collection",
    entityId: id.data,
    summary: `Collection products set (${count})`,
  });
  backTo(`/admin/content/collections/${id.data}`, { saved: `${count} product(s) saved.` });
}

export async function deleteCollectionAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const id = contentIdSchema.safeParse(formData.get("collectionId"));
  if (!id.success) return;
  await deleteCollection(id.data);
  await audit(admin, {
    action: "collection.delete",
    entityType: "collection",
    entityId: id.data,
    summary: "Collection deleted",
  });
  revalidatePath("/admin/content");
  backTo("/admin/content", { saved: "Collection deleted." });
}

export async function createStarterCollectionsAction(): Promise<void> {
  const admin = await requirePermission("content.manage");
  const created = await createStarterCollections();
  await audit(admin, {
    action: "collection.starters",
    entityType: "collection",
    entityId: "starters",
    summary: `Starter collections added (${created})`,
  });
  revalidatePath("/admin/content");
  backTo("/admin/content", {
    saved: created
      ? `${created} occasion collection(s) added as drafts. Tag products bridal / daily-wear / festive / gift, then publish them.`
      : "The occasion collections already exist.",
  });
}

export async function saveHomeSectionAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const raw = contentForm(formData, "sectionId");
  const parsed = homeSectionFormSchema.safeParse({
    ...raw,
    kind: raw.sectionKind,
    body: raw.sectionBody,
    collectionId: raw.sectionCollectionId,
  });
  if (!parsed.success) backTo("/admin/content#homepage", { error: firstIssue(parsed.error) });
  let id: string;
  try {
    id = (await saveHomeSection(parsed.data)).id;
  } catch (error) {
    if (error instanceof ContentInputError)
      backTo("/admin/content#homepage", { error: error.message });
    throw error;
  }
  await audit(admin, {
    action: parsed.data.id ? "home_section.update" : "home_section.create",
    entityType: "home_section",
    entityId: id,
    summary: `Homepage ${parsed.data.kind.toLowerCase()} section: ${parsed.data.title || "(no title)"}`,
  });
  revalidatePath("/admin/content");
  backTo("/admin/content#homepage", { saved: "Homepage section saved." });
}

export async function deleteHomeSectionAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const id = contentIdSchema.safeParse(formData.get("sectionId"));
  if (!id.success) return;
  await deleteHomeSection(id.data);
  await audit(admin, {
    action: "home_section.delete",
    entityType: "home_section",
    entityId: id.data,
    summary: "Homepage section deleted",
  });
  revalidatePath("/admin/content");
  backTo("/admin/content#homepage", { saved: "Homepage section deleted." });
}

export async function saveAnnouncementAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const parsed = announcementFormSchema.safeParse(contentForm(formData, "announcementId"));
  if (!parsed.success) backTo("/admin/content#announcements", { error: firstIssue(parsed.error) });
  let id: string;
  try {
    id = (await saveAnnouncement(parsed.data)).id;
  } catch (error) {
    if (error instanceof ContentInputError)
      backTo("/admin/content#announcements", { error: error.message });
    throw error;
  }
  await audit(admin, {
    action: parsed.data.id ? "announcement.update" : "announcement.create",
    entityType: "announcement",
    entityId: id,
    summary: `Announcement: ${parsed.data.message.slice(0, 80)}`,
  });
  revalidatePath("/admin/content");
  backTo("/admin/content#announcements", { saved: "Announcement saved." });
}

export async function deleteAnnouncementAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const id = contentIdSchema.safeParse(formData.get("announcementId"));
  if (!id.success) return;
  await deleteAnnouncement(id.data);
  await audit(admin, {
    action: "announcement.delete",
    entityType: "announcement",
    entityId: id.data,
    summary: "Announcement deleted",
  });
  revalidatePath("/admin/content");
  backTo("/admin/content#announcements", { saved: "Announcement deleted." });
}

export async function savePageAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const pageId = optionalContentId(formData.get("pageId"));
  const parsed = contentPageFormSchema.safeParse({ ...raw, id: pageId });
  const editPath = (id?: string) => `/admin/content/pages/${id ?? "new"}`;
  if (!parsed.success) backTo(editPath(pageId), { error: firstIssue(parsed.error) });
  let id: string;
  try {
    id = (await savePageDraft(parsed.data)).id;
  } catch (error) {
    if (error instanceof ContentInputError) backTo(editPath(pageId), { error: error.message });
    throw error;
  }
  await audit(admin, {
    action: pageId ? "page.update" : "page.create",
    entityType: "page",
    entityId: id,
    summary: `Page draft saved: ${parsed.data.title}`,
  });
  revalidatePath("/admin/content");
  backTo(editPath(id), { saved: "Draft saved. Customers still see the published version." });
}

export async function publishPageAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const id = contentIdSchema.safeParse(formData.get("pageId"));
  if (!id.success) return;
  try {
    await publishPage(id.data);
  } catch (error) {
    if (error instanceof ContentInputError)
      backTo(`/admin/content/pages/${id.data}`, { error: error.message });
    throw error;
  }
  await audit(admin, {
    action: "page.publish",
    entityType: "page",
    entityId: id.data,
    summary: "Page published",
  });
  revalidatePath("/admin/content");
  backTo(`/admin/content/pages/${id.data}`, {
    saved: "Published — customers now see this version.",
  });
}

export async function unpublishPageAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const id = contentIdSchema.safeParse(formData.get("pageId"));
  if (!id.success) return;
  await unpublishPage(id.data);
  await audit(admin, {
    action: "page.unpublish",
    entityType: "page",
    entityId: id.data,
    summary: "Page unpublished",
  });
  revalidatePath("/admin/content");
  backTo(`/admin/content/pages/${id.data}`, { saved: "Unpublished — the page is hidden." });
}

export async function deletePageAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("content.manage");
  const id = contentIdSchema.safeParse(formData.get("pageId"));
  if (!id.success) return;
  await deletePage(id.data);
  await audit(admin, {
    action: "page.delete",
    entityType: "page",
    entityId: id.data,
    summary: "Page deleted",
  });
  revalidatePath("/admin/content");
  backTo("/admin/content", { saved: "Page deleted." });
}

// ───────────────────────── System (Phase 26) ─────────────────────────

/** Runs every alert check now (otherwise they run with each cron tick). */
export async function runAlertChecksAction(): Promise<void> {
  const admin = await requirePermission("system.view");
  const changes = await evaluateAlerts();
  await audit(admin, {
    action: "system.check_alerts",
    entityType: "job",
    entityId: "alerts",
    summary: `Alert checks run (${changes.length} change(s))`,
  });
  revalidatePath("/admin/system");
}

// ───────────────────────── Manual delivery tracking (no courier API connected) ─────────────────

const manualTrackingSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{1,40}$/i),
  courier: z.string().trim().min(2, { message: "Enter the courier's name" }).max(60),
  awb: z
    .string()
    .trim()
    .max(60)
    .optional()
    .transform((v) => v || null),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\/[^\s"'<>]+$/.test(v), {
      message: "The tracking link must start with https://",
    }),
});

export async function saveManualTrackingAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("orders.update");
  const parsed = manualTrackingSchema.safeParse(Object.fromEntries(formData));
  const back = (id: string, q: string): never => redirect(`/admin/orders/${id}?${q}`);
  if (!parsed.success) {
    const id = String(formData.get("id") ?? "");
    if (!/^[a-z0-9]{1,40}$/i.test(id)) return;
    return back(
      id,
      `shipError=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form")}`,
    );
  }
  const { id, ...input } = parsed.data;
  try {
    await saveManualTracking(id, input, admin.id);
  } catch (error) {
    if (error instanceof AdminInputError)
      back(id, `shipError=${encodeURIComponent(error.message)}`);
    throw error;
  }
  await audit(admin, {
    action: "shipment.manual_tracking",
    entityType: "order",
    entityId: id,
    summary: `Tracking added by hand: ${input.courier}${input.awb ? ` ${input.awb}` : ""}`,
  });
  revalidatePath(`/admin/orders/${id}`);
  back(id, "tracking=1");
}

export async function addManualShipmentUpdateAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("orders.update");
  const parsed = z
    .object({
      id: z.string().regex(/^[a-z0-9]{1,40}$/i),
      shipStatus: z.enum(MANUAL_UPDATE_STATUSES),
      note: z
        .string()
        .trim()
        .max(120)
        .optional()
        .transform((v) => v || null),
      location: z
        .string()
        .trim()
        .max(80)
        .optional()
        .transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, shipStatus, note, location } = parsed.data;
  try {
    await addManualUpdate(id, { status: shipStatus, note, location }, admin.id);
  } catch (error) {
    if (error instanceof AdminInputError)
      redirect(`/admin/orders/${id}?shipError=${encodeURIComponent(error.message)}`);
    throw error;
  }
  await audit(admin, {
    action: "shipment.manual_update",
    entityType: "order",
    entityId: id,
    summary: `Delivery update: ${MANUAL_UPDATE_LABEL[shipStatus]}${note ? ` — ${note}` : ""}`,
  });
  revalidatePath(`/admin/orders/${id}`);
}
