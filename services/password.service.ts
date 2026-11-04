import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { normaliseEmail } from "@/lib/marketing";
import { hashPassword } from "@/services/auth.service";
import { enqueue, kickJobs } from "@/services/jobs.service";

/**
 * "Forgot password" (Phase 23).
 * - The link holds a random token; only its SHA-256 is stored. 30 minutes, one use.
 * - A new request cancels older links. Asking for an unknown email looks exactly the same
 *   (nothing reveals who has an account).
 * - Resetting changes the password, clears any lockout and signs out every existing session
 *   (passwordChangedAt — see auth.ts).
 */

export const RESET_MINUTES = 30;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export class ResetError extends Error {}

export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normaliseEmail(emailInput);
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    logger.info("auth.reset_requested_unknown");
    return;
  }
  const token = randomBytes(32).toString("base64url");
  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    const row = await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
      },
      select: { id: true },
    });
    await enqueue("email.marketing", { kind: "password_reset", resetId: row.id, token }, { tx });
  });
  await kickJobs();
  logger.info("auth.reset_requested", { userId: user.id });
}

/** Is this link still usable? (For showing the form or an "expired" message.) */
export async function resetTokenValid(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return false;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { usedAt: true, expiresAt: true },
  });
  return Boolean(row && !row.usedAt && row.expiresAt > new Date());
}

/** Sets the new password. The token is used up in the same transaction (one use, even in parallel). */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) throw new ResetError("This link isn't valid.");
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true },
  });
  if (!row) throw new ResetError("This link isn't valid.");
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    const used = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count === 0)
      throw new ResetError("This link has expired or was already used. Ask for a new one.");
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  });
  logger.info("auth.password_reset", { userId: row.userId });
}
