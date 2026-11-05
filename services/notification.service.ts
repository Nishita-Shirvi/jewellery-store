import "server-only";
import { render } from "@react-email/render";
import { OrderEmail, type OrderEmailProps } from "@/emails/order-email";
import { getBusiness } from "@/lib/business";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { formatINR } from "@/lib/format";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/services/email.service";
import { lineName } from "@/lib/variants";
import type { Prisma } from "@prisma/client";
import { enqueue, kickJobs } from "@/services/jobs.service";
import { openSnapshot } from "@/services/address.service";
import { emitWebhook, type WebhookEvent } from "@/services/integrations.service";

/**
 * The single place that tells customers about their order (email, and SMS when switched on).
 *
 * Since Phase 19 notifyOrder() only QUEUES the messages (as background jobs, inside the caller's
 * transaction when one is given). Rendering and sending happen in deliverOrderEmail() /
 * deliverOrderSms(), which throw on failure so the job is retried. A failed message can never
 * slow down or undo a payment, refund or status change.
 */
export type OrderEvent =
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "refund_processed";

/** Events that happen at most once per order: a second queued copy is dropped while one is pending. */
const ONCE_PER_ORDER: OrderEvent[] = ["confirmed", "shipped", "delivered", "cancelled"];
const SMS_EVENTS: OrderEvent[] = ["confirmed", "shipped", "delivered"];
const WEBHOOK_FOR: Partial<Record<OrderEvent, WebhookEvent>> = {
  confirmed: "order.confirmed",
  shipped: "order.shipped",
  delivered: "order.delivered",
  cancelled: "order.cancelled",
  refund_processed: "order.refunded",
};

export async function notifyOrder(
  orderId: string,
  event: OrderEvent,
  extra: { amountInPaise?: number; note?: string } = {},
  tx?: Prisma.TransactionClient,
) {
  const once = ONCE_PER_ORDER.includes(event);
  try {
    await enqueue(
      "email.order",
      { orderId, event, extra },
      { tx, dedupeKey: once ? `email:${event}:${orderId}` : undefined },
    );
    if (config.features.sms && SMS_EVENTS.includes(event))
      await enqueue("sms.order", { orderId, event }, { tx, dedupeKey: `sms:${event}:${orderId}` });
    // Phase 29: outgoing webhooks for the owner's other systems (none set up = nothing queued).
    const hook = WEBHOOK_FOR[event];
    if (hook)
      await emitWebhook(
        hook,
        { orderId, orderNumber: `#${orderId.slice(-8).toUpperCase()}`, ...extra },
        tx,
      );
  } catch (error) {
    // Inside a transaction the caller must see the failure; outside, never break the caller.
    if (tx) throw error;
    logger.error("notify.enqueue_failed", { orderId, event, error });
    return;
  }
  if (!tx) await kickJobs();
}

/** Renders and sends one order email. Throws on failure (the job retries). */
export async function deliverOrderEmail(
  orderId: string,
  event: OrderEvent,
  extra: { amountInPaise?: number; note?: string } = {},
) {
  {
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { email: true, name: true } },
        items: true,
        shipment: { select: { courier: true, awb: true, trackingUrl: true } },
        invoice: { select: { number: true } },
      },
    });
    if (!order) return;

    const n = `#${order.id.slice(-8).toUpperCase()}`;
    const orderUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/account/orders/${order.id}`;
    const amount = extra.amountInPaise
      ? formatINR(extra.amountInPaise)
      : formatINR(order.totalInPaise);
    const business = getBusiness();
    const isCod = order.paymentMethod === "COD";
    const items = order.items.map((i) => ({
      name: lineName(i.productName, i.variantLabel),
      quantity: i.quantity,
      amount: formatINR(i.lineTotalInPaise),
    }));

    const content: Record<
      OrderEvent,
      {
        subject: string;
        heading: string;
        paragraphs: string[];
        withItems?: boolean;
        button?: OrderEmailProps["button"];
      }
    > = {
      confirmed: {
        subject: `Order ${n} confirmed`,
        heading: "Thank you! Your order is confirmed.",
        paragraphs: [
          isCod
            ? `Order ${n} is confirmed for cash on delivery. Please keep ${formatINR(order.totalInPaise)} ready for the courier. We'll email you again when it ships.`
            : `We've received your payment for order ${n}. We'll email you again when it ships.`,
          ...(order.invoice
            ? [
                `Your tax invoice (${order.invoice.number}) is ready to download from your order page.`,
              ]
            : []),
        ],
        withItems: true,
        button: { label: "View your order", url: orderUrl },
      },
      shipped: {
        subject: `Order ${n} has shipped`,
        heading: "Your order is on its way",
        paragraphs: [
          order.shipment?.awb
            ? `It's travelling with ${order.shipment.courier ?? "our courier"}, tracking number ${order.shipment.awb}.`
            : `Order ${n} has left our store.`,
        ],
        button: order.shipment?.trackingUrl
          ? { label: "Track your parcel", url: order.shipment.trackingUrl }
          : { label: "View your order", url: orderUrl },
      },
      delivered: {
        subject: `Order ${n} delivered`,
        heading: "Delivered — enjoy your jewellery!",
        paragraphs: [
          `Order ${n} has been delivered. If anything isn't right, you can request a return from your order page within 7 days.`,
        ],
        button: { label: "View your order", url: orderUrl },
      },
      cancelled: {
        subject: `Order ${n} cancelled`,
        heading: "Your order is cancelled",
        paragraphs: [
          isCod && !order.paidAt
            ? `Order ${n} has been cancelled. It was cash on delivery, so there's nothing to refund.`
            : `Order ${n} has been cancelled. A full refund of ${amount} is on its way to your original payment method (usually 5–7 business days).`,
        ],
        button: { label: "View your order", url: orderUrl },
      },
      return_requested: {
        subject: `Return request received for order ${n}`,
        heading: "We've received your return request",
        paragraphs: [
          `We'll review your return for order ${n} within 2 business days and email you.`,
        ],
      },
      return_approved: {
        subject: `Return approved for order ${n}`,
        heading: "Your return is approved",
        paragraphs: [`A refund of ${amount} is on its way to your original payment method.`],
      },
      return_rejected: {
        subject: `Update on your return for order ${n}`,
        heading: "We couldn't approve your return",
        paragraphs: [
          `Unfortunately we couldn't approve the return for order ${n}.${extra.note ? ` Reason: ${extra.note}` : ""}`,
          "Reply to this email if you'd like to talk it through.",
        ],
      },
      refund_processed: {
        subject: `Refund processed for order ${n}`,
        heading: "Your refund has been processed",
        paragraphs: [
          `We've refunded ${amount} for order ${n}. Depending on your bank it can take a few days to show.`,
        ],
      },
    };

    const c = content[event];
    const element = OrderEmail({
      storeName: publicEnv.NEXT_PUBLIC_SITE_NAME,
      preview: c.paragraphs[0] ?? c.heading,
      heading: c.heading,
      greetingName: order.user.name?.split(" ")[0],
      paragraphs: c.paragraphs,
      items: c.withItems ? items : undefined,
      total: c.withItems ? formatINR(order.totalInPaise) : undefined,
      button: c.button,
      footer: `${business.legalName} · ${business.email} · ${business.phone}`,
    });
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await sendEmail({ to: order.user.email, subject: c.subject, html, text });
    logger.info("notify.email_sent", { orderId, event });
  }
}

/** Optional SMS through MSG91 (DLT-approved template). Off unless [features] sms = true in config.ini. */
export async function deliverOrderSms(orderId: string, event: OrderEvent) {
  if (!config.features.sms || !env.MSG91_AUTH_KEY || !env.MSG91_ORDER_FLOW_ID) return;
  if (!SMS_EVENTS.includes(event)) return;
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, addressSnapshot: true, user: { select: { smsUpdatesConsent: true } } },
  });
  // Phase 27: the customer can turn order-update SMS off (Account → Privacy).
  if (!order || !order.user.smsUpdatesConsent) return;
  const address = openSnapshot(order.addressSnapshot);
  if (!address.phone) return;
  const orderNumber = `#${order.id.slice(-8).toUpperCase()}`;
  const res = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: env.MSG91_AUTH_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: env.MSG91_ORDER_FLOW_ID,
      recipients: [{ mobiles: `91${address.phone}`, order: orderNumber, status: event }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`MSG91 responded ${res.status}`);
  logger.info("notify.sms_sent", { orderId, event });
}
