"use server";

import { revalidatePath } from "next/cache";
import type { Purity } from "@prisma/client";
import { requirePermission } from "@/lib/auth-guards";
import { logger } from "@/lib/logger";
import { PURITIES } from "@/lib/metal-pricing";
import {
  metalRateFormSchema,
  storefrontSettingsSchema,
  visitStatusSchema,
} from "@/lib/validation/storefront";
import { audit } from "@/services/audit.service";
import { RateError, saveRates } from "@/services/metal-rate.service";
import { saveStorefrontSettings } from "@/services/storefront.service";
import { VisitError, updateVisitStatus } from "@/services/visit.service";
import type { AdminFormState } from "./actions";

/** Admin actions for gold rates, showroom settings and visit requests. Each re-checks the staff member's permission. */

function typed(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries())
    if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

export async function saveRatesAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePermission("products.edit");
  const parsed = metalRateFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted rates.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: typed(formData),
    };
  }
  const input: Partial<Record<Purity, number>> = {};
  for (const p of PURITIES) {
    const v = parsed.data[p];
    if (v) input[p] = v;
  }
  try {
    const result = await saveRates(admin.id, input, parsed.data.confirmLarge);
    if (result.saved.length) {
      await audit(admin, {
        action: "metal_rate.update",
        entityType: "metal_rate",
        entityId: result.saved.join(","),
        summary: `Updated rates (${result.saved.join(", ")}); ${result.repriced} price(s) recalculated`,
        changes: result.changes,
      });
    }
    revalidatePath("/admin/rates");
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: result.saved.length
        ? `Saved. ${result.repriced} rate-linked price${result.repriced === 1 ? "" : "s"} updated.`
        : "No rate changed.",
    };
  } catch (error) {
    if (error instanceof RateError) return { error: error.message, values: typed(formData) };
    logger.error("admin.rates_failed", { error });
    return { error: "Something went wrong. Please try again.", values: typed(formData) };
  }
}

export async function saveStorefrontSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requirePermission("content.manage");
  const parsed = storefrontSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: typed(formData),
    };
  }
  await saveStorefrontSettings(parsed.data);
  await audit(admin, {
    action: "settings.storefront",
    entityType: "settings",
    entityId: "storefront",
    summary: "Updated showroom details",
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. The website shows the new details now." };
}

export async function updateVisitStatusAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("support.manage");
  const parsed = visitStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  try {
    const { name, before } = await updateVisitStatus(
      parsed.data.id,
      parsed.data.status,
      parsed.data.adminNote,
    );
    await audit(admin, {
      action: "visit.status",
      entityType: "visit",
      entityId: parsed.data.id,
      summary: `Visit from ${name}: ${before} → ${parsed.data.status}`,
      changes: { status: { from: before, to: parsed.data.status } },
    });
  } catch (error) {
    if (!(error instanceof VisitError)) logger.error("admin.visit_update_failed", { error });
  }
  revalidatePath("/admin/visits");
  revalidatePath("/admin");
}
