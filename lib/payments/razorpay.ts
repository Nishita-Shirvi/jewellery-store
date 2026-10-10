import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Thin Razorpay client: only what checkout needs. Docs: https://razorpay.com/docs/api/orders/ */

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

function credentials() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new RazorpayError("Razorpay keys are not configured");
  }
  return { keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET };
}

export async function createRazorpayOrder(input: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`${env.RAZORPAY_API_BASE}/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: input.amountInPaise,
      currency: "INR",
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new RazorpayError(
      `Razorpay order failed (${response.status}): ${body.slice(0, 200)}`,
      response.status,
    );
  }
  const order = (await response.json()) as RazorpayOrder;
  if (!order.id?.startsWith("order_") || order.amount !== input.amountInPaise) {
    throw new RazorpayError("Unexpected Razorpay order response");
  }
  return order;
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two hex signatures. */
export function signaturesMatch(expectedHex: string, receivedHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(receivedHex) || receivedHex.length !== expectedHex.length) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(receivedHex, "hex"));
}

/** Checkout success callback: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
  secret: string,
): boolean {
  return signaturesMatch(hmacHex(secret, `${razorpayOrderId}|${razorpayPaymentId}`), signature);
}

/** Webhook: HMAC_SHA256(raw request body, webhook_secret). Must use the raw body, not re-serialised JSON. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  return signaturesMatch(hmacHex(secret, rawBody), signature);
}

// ── Refunds (https://razorpay.com/docs/api/refunds/) ──

export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  notes?: Record<string, string> | [];
}

async function razorpayCall<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`${env.RAZORPAY_API_BASE}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let description = text.slice(0, 200);
    try {
      description =
        (JSON.parse(text) as { error?: { description?: string } }).error?.description ??
        description;
    } catch {}
    throw new RazorpayError(description, response.status);
  }
  return JSON.parse(text) as T;
}

/** Refunds part or all of a captured payment. `refundRef` is our Refund.id, stored in Razorpay's notes. */
export async function createRazorpayRefund(
  paymentId: string,
  amountInPaise: number,
  refundRef: string,
): Promise<RazorpayRefund> {
  return razorpayCall<RazorpayRefund>(`/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: {
      amount: amountInPaise,
      speed: "normal",
      receipt: refundRef.slice(0, 40),
      notes: { refundRef },
    },
  });
}

/** Refunds already made for a payment (used to avoid creating a duplicate after a lost response). */
export async function listRazorpayRefunds(paymentId: string): Promise<RazorpayRefund[]> {
  const res = await razorpayCall<{ items: RazorpayRefund[] }>(
    `/v1/payments/${encodeURIComponent(paymentId)}/refunds?count=100`,
    { method: "GET" },
  );
  return res.items ?? [];
}

export function refundRefOf(refund: RazorpayRefund): string | undefined {
  return !refund.notes || Array.isArray(refund.notes) ? undefined : refund.notes.refundRef;
}
