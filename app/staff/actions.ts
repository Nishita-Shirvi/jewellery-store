"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { audit } from "@/services/audit.service";
import {
  StaffError,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_HOURS,
  acceptInvite,
  confirmTotpSetup,
  getStaffAccess,
  startTotpSetup,
  twoFactorCookieValue,
  verifyTwoFactor,
} from "@/services/staff.service";

/**
 * Two-step sign-in and invitations (Phase 21). These need a signed-in user but NOT a passed
 * 2FA check (that's what they are for). Code checks are rate-limited per person.
 */

export type StaffResult =
  | {
      ok: true;
      redirectTo?: string;
      secret?: string;
      uri?: string;
      codes?: string[];
      message?: string;
    }
  | { ok: false; error: string };

async function setTwoFactorCookie(userId: string, enabledAt: Date) {
  (await cookies()).set(TWO_FACTOR_COOKIE, twoFactorCookieValue(userId, enabledAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: TWO_FACTOR_HOURS * 3600,
  });
}

async function staffOnly() {
  const user = await requireUser();
  const access = await getStaffAccess(user.id);
  if (!access.isStaff) return null;
  return { user, access };
}

export async function startTotpSetupAction(): Promise<StaffResult> {
  const me = await staffOnly();
  if (!me) return { ok: false, error: "Only staff can set up two-step sign-in here." };
  try {
    const { secret, uri } = await startTotpSetup(me.user.id, me.user.email ?? me.user.id);
    return { ok: true, secret, uri };
  } catch (error) {
    if (error instanceof StaffError) return { ok: false, error: error.message };
    throw error;
  }
}

const codeSchema = z.string().trim().min(6).max(20);

export async function confirmTotpSetupAction(code: string): Promise<StaffResult> {
  const me = await staffOnly();
  if (!me) return { ok: false, error: "Only staff can set up two-step sign-in here." };
  if (!rateLimit(`2fa:${me.user.id}`, 10, 15 * 60_000).ok)
    return { ok: false, error: "Too many attempts. Wait 15 minutes." };
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code from the app." };
  try {
    const { codes, enabledAt } = await confirmTotpSetup(me.user.id, parsed.data);
    await setTwoFactorCookie(me.user.id, enabledAt);
    await audit(me.user, {
      action: "staff.2fa_enabled",
      entityType: "staff",
      entityId: me.user.id,
      summary: "Set up two-step sign-in",
    });
    return { ok: true, codes };
  } catch (error) {
    if (error instanceof StaffError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function verifyTwoFactorAction(
  code: string,
  callbackUrl: string,
): Promise<StaffResult> {
  const me = await staffOnly();
  if (!me) return { ok: false, error: "Only staff can sign in here." };
  if (!rateLimit(`2fa:${me.user.id}`, 10, 15 * 60_000).ok)
    return { ok: false, error: "Too many attempts. Wait 15 minutes." };
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return { ok: false, error: "Enter the 6-digit code from the app." };
  try {
    const enabledAt = await verifyTwoFactor(me.user.id, parsed.data);
    await setTwoFactorCookie(me.user.id, enabledAt);
    return { ok: true, redirectTo: safeRedirectPath(callbackUrl, "/admin") };
  } catch (error) {
    if (error instanceof StaffError) {
      await audit(me.user, {
        action: "staff.2fa_failed",
        entityType: "staff",
        entityId: me.user.id,
        summary: "Wrong two-step sign-in code",
      });
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function acceptInviteAction(token: string): Promise<StaffResult> {
  const user = await requireUser();
  if (!rateLimit(`invite:${user.id}`, 10, 60 * 60_000).ok)
    return { ok: false, error: "Too many attempts. Try again later." };
  try {
    const { roleName } = await acceptInvite(String(token ?? ""), user);
    await audit(user, {
      action: "staff.invite_accepted",
      entityType: "staff",
      entityId: user.id,
      summary: `Joined the staff as ${roleName}`,
    });
    return { ok: true, redirectTo: "/staff/2fa?callbackUrl=%2Fadmin", message: roleName };
  } catch (error) {
    if (error instanceof StaffError) return { ok: false, error: error.message };
    throw error;
  }
}
