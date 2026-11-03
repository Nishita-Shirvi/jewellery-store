import { NextResponse } from "next/server";
import type { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { bodyHash, razorpayWebhookSchema, recordWebhook } from "@/services/webhook.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * POST /api/webhooks/razorpay
 * Set this URL in Razorpay Dashboard → Webhooks with events payment.captured, payment.failed,
 * refund.processed and refund.failed. Verifies, saves, queues — the work happens in a job.
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

  let event: z.infer<typeof razorpayWebhookSchema>;
  try {
    event = razorpayWebhookSchema.parse(JSON.parse(rawBody));
  } catch {
    logger.warn("webhook.razorpay_bad_payload");
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  // Save + queue, then answer at once. Processing runs as a background job with retries.
  const eventId = request.headers.get("x-razorpay-event-id") || `body:${bodyHash(rawBody)}`;
  try {
    const { duplicate } = await recordWebhook({
      provider: "razorpay",
      eventId,
      eventType: event.event,
      payload: JSON.parse(rawBody),
    });
    logger.info("webhook.razorpay_received", { event: event.event, eventId, duplicate });
    return NextResponse.json({ ok: true, duplicate });
  } catch (error) {
    // Couldn't even save it: 500 makes Razorpay send it again later.
    logger.error("webhook.razorpay_save_failed", { event: event.event, eventId, error });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
