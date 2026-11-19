import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { maskMobile } from "@/lib/cod";
import { decryptPii, encryptPii } from "@/lib/pii";

/**
 * SMS one-time codes (Phase 18, used before cash-on-delivery orders).
 *
 * - Only an HMAC of the code is stored (keyed with AUTH_SECRET), never the code.
 * - A code lives OTP_MINUTES, allows MAX_ATTEMPTS guesses, and can be used once: the final
 *   "consume" is a conditional UPDATE inside the order transaction, so two clicks can't both use it.
 * - At most MAX_SENDS codes per user per 10 minutes (SMS costs money and can be abused).
 * - Sent through MSG91 (DLT-approved flow). Without MSG91 keys, development writes the code to
 *   the server log; production refuses (COD is then hidden).
 */

export const OTP_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS = 3;

type Tx = Prisma.TransactionClient;

export class OtpError extends Error {}

const smsConfigured = () => Boolean(env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID);

/** Can a code be delivered right now? */
export function otpAvailable(): boolean {
  return smsConfigured() || env.NODE_ENV !== "production";
}

function hashCode(challengeId: string, code: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`${challengeId}:${code}`).digest("hex");
}

async function deliver(phone: string, code: string): Promise<boolean> {
  if (!smsConfigured()) {
    if (env.NODE_ENV === "production") return false;
    // Development only — never in production.
    logger.warn("otp.dev_code", { phone: maskMobile(phone), code });
    return true;
  }
  try {
    const base = env.MSG91_API_BASE ?? "https://control.msg91.com";
    const res = await fetch(`${base}/api/v5/flow/`, {
      method: "POST",
      headers: { authkey: env.MSG91_AUTH_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: env.MSG91_OTP_TEMPLATE_ID,
        short_url: "0",
        recipients: [{ mobiles: `91${phone}`, otp: code }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) logger.warn("otp.sms_failed", { status: res.status, phone: maskMobile(phone) });
    return res.ok;
  } catch (error) {
    logger.warn("otp.sms_failed", { error, phone: maskMobile(phone) });
    return false;
  }
}

/** Sends a new code. Returns the challenge id the browser sends back with the code. */
export async function sendOtp(
  userId: string,
  phone: string,
  purpose: string,
): Promise<{ challengeId: string; expiresAt: Date }> {
  const recent = await db.otpChallenge.count({
    where: { userId, createdAt: { gt: new Date(Date.now() - 10 * 60_000) } },
  });
  if (recent >= MAX_SENDS)
    throw new OtpError("Too many codes sent. Please wait 10 minutes and try again.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60_000);
  const challenge = await db.otpChallenge.create({
    data: { userId, phone: encryptPii(phone), purpose, codeHash: "pending", expiresAt },
    select: { id: true },
  });
  await db.otpChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: hashCode(challenge.id, code) },
  });

  if (!(await deliver(phone, code))) {
    await db.otpChallenge.delete({ where: { id: challenge.id } });
    throw new OtpError("We couldn't send the code. Please try again or pay online.");
  }
  logger.info("otp.sent", { userId, purpose, phone: maskMobile(phone) });
  return { challengeId: challenge.id, expiresAt };
}

/**
 * Checks a code (counts as one attempt even if it's wrong). Does NOT use it up — call
 * consumeOtp() inside the transaction that does the protected action.
 */
export async function checkOtp(input: {
  challengeId: string;
  userId: string;
  phone: string;
  purpose: string;
  code: string;
}): Promise<void> {
  if (!/^\d{6}$/.test(input.code)) throw new OtpError("Enter the 6-digit code.");
  // Count the attempt first: a wrong guess always costs one try. One conditional UPDATE, so
  // parallel guesses can't get past MAX_ATTEMPTS. (Prisma's typed query, not raw SQL: dates are
  // stored as UTC without a zone, and raw comparisons would use the database server's timezone.)
  const counted = await db.otpChallenge.updateMany({
    where: {
      id: input.challengeId,
      userId: input.userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  const row =
    counted.count === 1
      ? await db.otpChallenge.findUnique({
          where: { id: input.challengeId },
          select: { codeHash: true, phone: true, purpose: true },
        })
      : null;
  if (!row)
    throw new OtpError("This code has expired or was tried too many times. Send a new one.");
  if (decryptPii(row.phone) !== input.phone || row.purpose !== input.purpose)
    throw new OtpError("This code was sent to a different number. Send a new one.");
  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashCode(input.challengeId, input.code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    throw new OtpError("That code isn't right. Check the SMS and try again.");
}

/** Uses up a checked code inside the caller's transaction. False if it was already used. */
export async function consumeOtp(tx: Tx, challengeId: string, userId: string): Promise<boolean> {
  const used = await tx.otpChallenge.updateMany({
    where: { id: challengeId, userId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return used.count === 1;
}
