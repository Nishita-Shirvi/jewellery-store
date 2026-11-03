"use server";

import { revalidatePath } from "next/cache";
import { audit, diff } from "@/services/audit.service";
import { getProductAdmin } from "@/services/admin/product-admin.service";
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
import { ReturnError, approveReturn, rejectReturn } from "@/services/return.service";
import { markManualRefundPaid, retryRefund } from "@/services/refund.service";
import { markCashReceived } from "@/services/cod.service";
import { enqueueAndRunNow, retryDeadJob } from "@/services/jobs.service";
import { createInvoiceForOrder } from "@/services/invoice.service";
import { saveCoupon, setCouponActive } from "@/services/admin/coupon-admin.service";
import { ReviewError, moderateReview } from "@/services/review.service";
import { couponFormSchema } from "@/lib/validation/admin";
import { MAX_OPTIONS, optionsInputSchema, parseValueList } from "@/lib/variants";
import { parseGramsToMg, parseRupeesToPaise } from "@/lib/money";
import {
  bulkUpdateVariants,
  saveOptions,
  type VariantRowInput,
} from "@/services/admin/variant-admin.service";

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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
  const parsed = orderStatusUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
  const admin = await requireAdmin();
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
