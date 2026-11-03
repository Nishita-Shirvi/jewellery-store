"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { decodeEmail, verifyEmailLink } from "@/lib/marketing";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import {
  StockAlertError,
  confirmNewsletter,
  requestStockAlert,
  subscribeNewsletter,
  unsubscribe,
} from "@/services/marketing.service";

/** Public marketing actions (Phase 20). Rate-limited per IP; never reveal who is subscribed. */

export type SimpleResult = { ok: true; message: string } | { ok: false; error: string };

const emailSchema = z.email({ message: "Enter a valid email address" }).max(254);

async function limited(key: string, max: number): Promise<boolean> {
  const ip = getClientIp(await headers());
  return !rateLimit(`${key}:${ip}`, max, 60 * 60 * 1000).ok;
}

export async function subscribeNewsletterAction(input: {
  email: string;
  consent: boolean;
}): Promise<SimpleResult> {
  const email = emailSchema.safeParse(String(input.email ?? "").trim());
  if (!email.success) return { ok: false, error: "Enter a valid email address." };
  if (input.consent !== true) return { ok: false, error: "Please tick the box to agree." };
  if (await limited("newsletter", 10))
    return { ok: false, error: "Too many attempts. Please try again later." };
  await subscribeNewsletter(email.data, "footer");
  return { ok: true, message: "Almost done — check your inbox and click the link to confirm." };
}

export async function confirmNewsletterAction(token: string): Promise<SimpleResult> {
  if (await limited("newsletter-confirm", 30))
    return { ok: false, error: "Too many attempts. Please try again later." };
  return (await confirmNewsletter(String(token ?? "")))
    ? { ok: true, message: "You're subscribed. Thank you!" }
    : { ok: false, error: "This link has expired or was already used." };
}

export async function unsubscribeAction(e: string, t: string): Promise<SimpleResult> {
  const email = decodeEmail(String(e ?? ""));
  if (!email || !verifyEmailLink(email, "unsubscribe", String(t ?? ""), env.AUTH_SECRET))
    return { ok: false, error: "This unsubscribe link isn't valid." };
  await unsubscribe(email, "link");
  return { ok: true, message: "You're unsubscribed. We won't send you marketing emails." };
}

export async function notifyMeAction(input: {
  variantId: string;
  email?: string;
}): Promise<SimpleResult> {
  const variantId = z
    .string()
    .regex(/^[a-z0-9]{1,40}$/i)
    .safeParse(input.variantId);
  if (!variantId.success) return { ok: false, error: "Something was wrong with that request." };
  const user = await getCurrentUser();
  const email = emailSchema.safeParse(String(input.email ?? user?.email ?? "").trim());
  if (!email.success) return { ok: false, error: "Enter a valid email address." };
  if (await limited("notify-me", 20))
    return { ok: false, error: "Too many attempts. Please try again later." };
  try {
    await requestStockAlert({ email: email.data, variantId: variantId.data, userId: user?.id });
  } catch (error) {
    if (error instanceof StockAlertError) return { ok: false, error: error.message };
    throw error;
  }
  return { ok: true, message: "We'll email you as soon as it's back." };
}
