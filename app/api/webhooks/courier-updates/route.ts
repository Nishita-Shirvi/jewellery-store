import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { bodyHash, recordWebhook, shiprocketWebhookSchema } from "@/services/webhook.service";
import { addMetric } from "@/lib/metrics";
import { withRequestId } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/courier-updates — Shiprocket tracking webhook.
 * (Shiprocket rejects webhook URLs that contain the word "shiprocket", hence the neutral name.)
 * Shiprocket sends the token you choose in its dashboard as the x-api-key header.
 */

function tokenMatches(given: string | null): boolean {
  if (!env.SHIPROCKET_WEBHOOK_TOKEN || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.SHIPROCKET_WEBHOOK_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handlePOST(request: Request) {
  const limit = rateLimit(`courier-webhook:${getClientIp(request.headers)}`, 600, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  if (!env.SHIPROCKET_WEBHOOK_TOKEN)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!tokenMatches(request.headers.get("x-api-key"))) {
    logger.warn("webhook.courier_bad_token", { ip: getClientIp(request.headers) });
    await addMetric("webhook.bad_signature");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let payload: z.infer<typeof shiprocketWebhookSchema>;
  try {
    payload = shiprocketWebhookSchema.parse(JSON.parse(raw));
  } catch {
    logger.warn("webhook.courier_bad_payload");
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  // Shiprocket sends no event id: the same body twice is the same event.
  try {
    const { duplicate } = await recordWebhook({
      provider: "shiprocket",
      eventId: `${payload.awb}:${bodyHash(raw)}`,
      eventType: payload.current_status ?? payload.shipment_status ?? "update",
      payload: JSON.parse(raw),
    });
    logger.info("webhook.courier_received", { awb: payload.awb, duplicate });
    // Unknown AWBs are accepted too, so Shiprocket doesn't keep retrying test pings.
    return NextResponse.json({ ok: true, duplicate });
  } catch (error) {
    logger.error("webhook.courier_save_failed", { awb: payload.awb, error });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

/** Phase 26: every log line of this request shares one id (also sent as x-request-id). */
export const POST = withRequestId(handlePOST);
