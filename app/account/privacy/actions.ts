"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getCurrentUser, requireUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { PrivacyError, deleteAccount, setConsent } from "@/services/privacy.service";

export interface PrivacyFormState {
  error?: string;
}

/** Account → Privacy toggles (Phase 27). Only the two account-level channels. */
export async function setConsentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const channel = formData.get("channel");
  if (channel !== "email_marketing" && channel !== "sms_updates") return;
  const granted = formData.get("granted") === "true";
  await setConsent(user.id, channel, granted, "account");
  revalidatePath("/account/privacy");
}

/** The cookie banner / analytics toggle: logged for signed-in customers (the cookie is the switch). */
export async function recordAnalyticsConsentAction(granted: boolean): Promise<void> {
  const user = await getCurrentUser();
  if (!user || typeof granted !== "boolean") return;
  if (!rateLimit(`analytics-consent:${user.id}`, 20, 60 * 60_000).ok) return;
  await setConsent(user.id, "analytics", granted, "cookie_banner");
}

/**
 * "Delete my account". Needs the word DELETE, and the password when the account has one, so a
 * left-open laptop or a stray click can't do it.
 */
export async function deleteAccountAction(
  _prev: PrivacyFormState,
  formData: FormData,
): Promise<PrivacyFormState> {
  const user = await requireUser();
  if (!rateLimit(`delete-account:${user.id}`, 5, 60 * 60_000).ok)
    return { error: "Too many attempts. Please try again later." };
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE")
    return { error: "Type DELETE (in capitals) to confirm." };
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (row?.passwordHash) {
    const ok = await bcrypt.compare(String(formData.get("password") ?? ""), row.passwordHash);
    if (!ok) return { error: "That password isn't right." };
  }
  try {
    await deleteAccount(user.id);
  } catch (error) {
    if (error instanceof PrivacyError) return { error: error.message };
    throw error;
  }
  await signOut({ redirect: false });
  redirect("/?account=deleted");
}
