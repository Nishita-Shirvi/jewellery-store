/**
 * Marketing helpers (Phase 20) — pure functions, no database, so every rule is unit-tested.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Signed links (unsubscribe): the email and purpose are signed with AUTH_SECRET, so a link can't
 * be changed to unsubscribe someone else, and nothing has to be stored to check it.
 */
export function signEmailLink(email: string, purpose: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${purpose}:${normaliseEmail(email)}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyEmailLink(
  email: string,
  purpose: string,
  token: string,
  secret: string,
): boolean {
  const expected = Buffer.from(signEmailLink(email, purpose, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const encodeEmail = (email: string) =>
  Buffer.from(normaliseEmail(email)).toString("base64url");
export function decodeEmail(value: string): string | null {
  try {
    const email = Buffer.from(value, "base64url").toString("utf8");
    return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

/** Codes people type: capital letters and digits without look-alikes (no 0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

export interface ReminderRules {
  firstAfterMs: number;
  secondAfterMs: number;
}

/** Carts left longer than this get no reminders at all (too late to be helpful). */
export const REMINDER_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/**
 * Which cart reminder is due now (0 = none). `sent` are the reminders already sent for this
 * version of the cart (its last change). Step 2 only follows step 1, and never sooner after it
 * than the planned gap (so a scheduler that was down for a day can't send both at once).
 * Nothing is sent once the customer has ordered since, unsubscribed, or after 7 days.
 */
export function dueReminderStep(input: {
  lastActivity: Date;
  now: Date;
  sent: { step: number; sentAt: Date }[];
  orderedSince: boolean;
  unsubscribed: boolean;
  rules: ReminderRules;
}): 0 | 1 | 2 {
  if (input.orderedSince || input.unsubscribed) return 0;
  const idle = input.now.getTime() - input.lastActivity.getTime();
  if (idle > REMINDER_MAX_AGE_MS) return 0;
  const first = input.sent.find((r) => r.step === 1);
  const second = input.sent.find((r) => r.step === 2);
  if (!first) return idle >= input.rules.firstAfterMs ? 1 : 0;
  if (second) return 0;
  const gap = input.rules.secondAfterMs - input.rules.firstAfterMs;
  return idle >= input.rules.secondAfterMs && input.now.getTime() - first.sentAt.getTime() >= gap
    ? 2
    : 0;
}
