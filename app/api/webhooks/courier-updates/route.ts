import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { parseShiprocketDate } from "@/lib/shipping/dates";
import { applyTrackingUpdate } from "@/services/shipment.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/courier-updates — Shiprocket tracking webhook.
 * (Shiprocket rejects webhook URLs that contain the word "shiprocket", hence the neutral name.)
 * Shiprocket sends the token you choose in its dashboard as the x-api-key header.
 */

const scanSchema = z
  .object({
    date: z.string().optional(),
    activity: z.string().optional(),
    location: z.string().nullable().optional(),
    "sr-status": z.union([z.string(), z.number()]).nullable().optional(),
    "sr-status-label": z.string().nullable().optional(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    awb: z.union([z.string(), z.number()]).transform(String),
    current_status: z.string().nullable().optional(),
    current_status_id: z.coerce.number().nullable().optional(),
    shipment_status: z.string().nullable().optional(),
    shipment_status_id: z.coerce.number().nullable().optional(),
    current_timestamp: z.string().nullable().optional(),
    scans: z.array(scanSchema).max(200).optional(),
  })
  .passthrough();

function tokenMatches(given: string | null): boolean {
  if (!env.SHIPROCKET_WEBHOOK_TOKEN || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.SHIPROCKET_WEBHOOK_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const limit = rateLimit(`courier-webhook:${getClientIp(request.headers)}`, 600, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  if (!env.SHIPROCKET_WEBHOOK_TOKEN)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!tokenMatches(request.headers.get("x-api-key"))) {
    logger.warn("webhook.courier_bad_token", { ip: getClientIp(request.headers) });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });

  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(JSON.parse(raw));
  } catch {
    logger.warn("webhook.courier_bad_payload");
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const now = new Date();
  const statusLabel = payload.current_status ?? payload.shipment_status ?? null;
  const statusId = payload.current_status_id ?? payload.shipment_status_id ?? null;

  try {
    const result = await applyTrackingUpdate({
      awb: payload.awb,
      statusId,
      statusLabel,
      occurredAt: parseShiprocketDate(payload.current_timestamp, now),
      scans: (payload.scans ?? []).map((s) => ({
        label: s.activity || s["sr-status-label"] || "Update", // the courier's readable text first
        statusId: s["sr-status"] != null ? Number(s["sr-status"]) : null,
        location: s.location ?? null,
        occurredAt: parseShiprocketDate(s.date, now),
      })),
      raw: JSON.parse(raw),
    });
    logger.info("webhook.courier_processed", { awb: payload.awb, status: statusLabel, result });
    // Unknown AWBs still get 200 so Shiprocket doesn't keep retrying test pings.
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    logger.error("webhook.courier_processing_failed", {
      awb: payload.awb,
      error,
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
