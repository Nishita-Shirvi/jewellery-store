import "server-only";
import { env } from "@/lib/env";
import { formatINR } from "@/lib/format";
import { errorMessage, logger } from "@/lib/logger";

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends through Resend's HTTP API. Without RESEND_API_KEY the email is only logged. */
async function sendEmail(message: EmailMessage): Promise<void> {
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export interface OrderEmailData {
  orderId: string;
  displayNumber: string;
  customerName: string | null;
  email: string;
  totalInPaise: number;
  items: { name: string; quantity: number; lineTotalInPaise: number }[];
}

/** Never throws: a failed email must not undo a paid order. Phase 19 adds retries via a job queue. */
export async function sendOrderConfirmationEmail(order: OrderEmailData): Promise<void> {
  const url = `${env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/orders/${order.orderId}/success`;
  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(i.name)} × ${i.quantity}</td><td style="text-align:right">${formatINR(i.lineTotalInPaise)}</td></tr>`,
    )
    .join("");

  try {
    await sendEmail({
      to: order.email,
      subject: `Order ${order.displayNumber} confirmed`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
<h1 style="font-size:20px">Thank you${order.customerName ? `, ${escapeHtml(order.customerName.split(" ")[0] ?? "")}` : ""}!</h1>
<p>Your payment was received and order <strong>${order.displayNumber}</strong> is confirmed.</p>
<table style="border-collapse:collapse;font-size:14px">${rows}
<tr><td style="padding-top:8px;font-weight:600">Total</td><td style="padding-top:8px;text-align:right;font-weight:600">${formatINR(order.totalInPaise)}</td></tr></table>
<p><a href="${url}">View your order</a></p></div>`,
      text: `Order ${order.displayNumber} confirmed.\n${order.items.map((i) => `${i.name} x ${i.quantity}: ${formatINR(i.lineTotalInPaise)}`).join("\n")}\nTotal: ${formatINR(order.totalInPaise)}\n${url}`,
    });
    logger.info("email.order_confirmation_sent", { orderId: order.orderId });
  } catch (error) {
    logger.error("email.order_confirmation_failed", {
      orderId: order.orderId,
      error: errorMessage(error),
    });
  }
}
