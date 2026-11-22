"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-guards";
import type { EntranceSettings } from "@/lib/entrance";
import { entranceSchema } from "@/lib/validation/entrance";
import { audit } from "@/services/audit.service";
import { saveEntrance } from "@/services/entrance.service";

/** Admin → Appearance → Sign-in & top bar. Re-checks the "content.manage" permission. */

export type EntranceSaveResult =
  | { ok: true; entrance: EntranceSettings }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function saveEntranceAction(input: unknown): Promise<EntranceSaveResult> {
  const admin = await requirePermission("content.manage");
  const parsed = entranceSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const entrance = parsed.data;
  await saveEntrance(entrance);
  await audit(admin, {
    action: "settings.entrance",
    entityType: "settings",
    entityId: "entrance",
    summary: `Sign-in video ${entrance.video ? "on" : "off"}; top bar ${entrance.topBar ? `on ("${entrance.tagline.slice(0, 60)}")` : "off"}`,
  });
  revalidatePath("/", "layout");
  return { ok: true, entrance };
}
