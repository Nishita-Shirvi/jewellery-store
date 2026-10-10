import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends through Resend's HTTP API. Without RESEND_API_KEY the email is only logged. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.info("email.skipped_no_api_key", { to: message.to, subject: message.subject });
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `Resend responded ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
}

export interface OrderEmailData {
  orderId: string;
}

/** Kept for existing callers; all order emails now go through services/notification.service.ts. */
export async function sendOrderConfirmationEmail(order: OrderEmailData): Promise<void> {
  const { notifyOrder } = await import("@/services/notification.service");
  await notifyOrder(order.orderId, "confirmed");
}

export type OrderUpdateKind =
  "cancelled" | "return_requested" | "return_approved" | "return_rejected" | "refund_processed";

export async function sendOrderUpdateEmail(
  orderId: string,
  kind: OrderUpdateKind,
  extra: { amountInPaise?: number; note?: string } = {},
): Promise<void> {
  const { notifyOrder } = await import("@/services/notification.service");
  await notifyOrder(orderId, kind, extra);
}
