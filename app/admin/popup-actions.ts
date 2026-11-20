"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import type { PopupSettings } from "@/lib/popup";
import { popupSchema } from "@/lib/validation/popup";
import { audit } from "@/services/audit.service";
import { savePopup } from "@/services/popup.service";

/** Admin → Appearance → Popup. Re-checks the "content.manage" permission on the server. */

export type PopupSaveResult =
  | { ok: true; popup: PopupSettings }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function savePopupAction(input: unknown): Promise<PopupSaveResult> {
  const admin = await requirePermission("content.manage");
  // A new version on every save, so shoppers who closed the old popup see the new one.
  const candidate = { ...((input ?? {}) as object), version: Date.now().toString(36) };
  const parsed = popupSchema.safeParse(candidate);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const popup = parsed.data as PopupSettings;
  if (popup.action === "visit" && !config.features.visit_booking)
    return {
      ok: false,
      error: "Visit booking is switched off (config/features.ini). Choose another action.",
      fieldErrors: { action: "Visit booking is switched off" },
    };
  await savePopup(popup);
  await audit(admin, {
    action: "settings.popup",
    entityType: "settings",
    entityId: "popup",
    summary: `${popup.on ? "Popup on" : "Popup off"}: "${popup.heading.slice(0, 60)}" (${popup.action}${popup.from || popup.until ? `, ${popup.from || "now"} to ${popup.until || "no end"}` : ""})`,
  });
  revalidatePath("/", "layout");
  return { ok: true, popup };
}
