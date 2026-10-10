import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { errorMessage, logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { markOrderPaid, markPaymentFailed } from "@/services/order.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

const paymentEntity = z.object({
  id: z.string().startsWith("pay_"),
  order_id: z.string().startsWith("order_"),
  amount: z.number().int(),
  status: z.string(),
  method: z.string().optional(),
  error_description: z.string().nullable().optional(),
  error_reason: z.string().nullable().optional(),
});

const webhookSchema = z.object({
  event: z.string(),
  payload: z.object({ payment: z.object({ entity: paymentEntity }).optional() }).passthrough(),
});

/**
 * POST /api/webhooks/razorpay
 * Set this URL in Razorpay Dashboard → Webhooks with events payment.captured and payment.failed.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`webhook:${getClientIp(request.headers)}`, 300, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    logger.error("webhook.razorpay_secret_missing");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES)
    return NextResponse.json({ error: "too_large" }, { status: 413 });

  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(rawBody, signature, env.RAZORPAY_WEBHOOK_SECRET)) {
    logger.warn("webhook.razorpay_bad_signature", { ip: getClientIp(request.headers) });
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: z.infer<typeof webhookSchema>;
  try {
    event = webhookSchema.parse(JSON.parse(rawBody));
  } catch {
    logger.warn("webhook.razorpay_bad_payload");
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const eventId = request.headers.get("x-razorpay-event-id") ?? undefined;
  const payment = event.payload.payment?.entity;
  logger.info("webhook.razorpay_received", {
    event: event.event,
    eventId,
    razorpayPaymentId: payment?.id,
  });

  try {
    if (event.event === "payment.captured" && payment) {
      const result = await markOrderPaid({
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        amountInPaise: payment.amount,
        method: payment.method,
        rawPayload: JSON.parse(rawBody),
        source: "webhook",
      });
      logger.info("webhook.razorpay_processed", {
        event: event.event,
        eventId,
        outcome: result.outcome,
      });
    } else if (event.event === "payment.failed" && payment) {
      const result = await markPaymentFailed({
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        reason: payment.error_description ?? payment.error_reason ?? "Payment failed",
        rawPayload: JSON.parse(rawBody),
      });
      logger.info("webhook.razorpay_processed", {
        event: event.event,
        eventId,
        outcome: result.outcome,
      });
    } else {
      logger.info("webhook.razorpay_ignored", { event: event.event, eventId });
    }
  } catch (error) {
    // 500 makes Razorpay retry later; processing is idempotent so retries are safe.
    logger.error("webhook.razorpay_processing_failed", {
      event: event.event,
      eventId,
      error: errorMessage(error),
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
