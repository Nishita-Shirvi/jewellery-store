import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseShiprocketDate } from "@/lib/shipping/dates";
import { enqueue, kickJobs, PermanentJobError } from "@/services/jobs.service";

/**
 * Webhooks (Phase 19): the HTTP route only checks the signature/token and the shape, saves the
 * event here and returns 200 at once. The work (marking orders paid, refunds, tracking) runs as a
 * background job with retries. A repeated delivery of the same event is saved once and queued once.
 */

// ───────────────────────── Razorpay ─────────────────────────

const paymentEntity = z.object({
  id: z.string().startsWith("pay_"),
  order_id: z.string().startsWith("order_"),
  amount: z.number().int(),
  status: z.string(),
  method: z.string().optional(),
  error_description: z.string().nullable().optional(),
  error_reason: z.string().nullable().optional(),
});

const refundEntity = z.object({
  id: z.string().startsWith("rfnd_"),
  payment_id: z.string(),
  amount: z.number().int(),
  status: z.string(),
  notes: z.union([z.record(z.string(), z.string()), z.array(z.unknown())]).optional(),
});

export const razorpayWebhookSchema = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z.object({ entity: paymentEntity }).optional(),
      refund: z.object({ entity: refundEntity }).optional(),
    })
    .passthrough(),
});

// ───────────────────────── Shiprocket ─────────────────────────

const scanSchema = z
  .object({
    date: z.string().optional(),
    activity: z.string().optional(),
    location: z.string().nullable().optional(),
    "sr-status": z.union([z.string(), z.number()]).nullable().optional(),
    "sr-status-label": z.string().nullable().optional(),
  })
  .passthrough();

export const shiprocketWebhookSchema = z
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

// ───────────────────────── saving ─────────────────────────

export function bodyHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Saves a verified event and queues its processing — both in one transaction, so an event is
 * never saved without its job (or queued twice). Returns duplicate = true for a repeat delivery.
 */
export async function recordWebhook(input: {
  provider: "razorpay" | "shiprocket";
  eventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
}): Promise<{ duplicate: boolean }> {
  const duplicate = await db.$transaction(async (tx) => {
    const saved = await tx.webhookEvent.createMany({
      data: [
        {
          provider: input.provider,
          eventId: input.eventId.slice(0, 200),
          eventType: input.eventType.slice(0, 100),
          payload: input.payload,
        },
      ],
      skipDuplicates: true,
    });
    if (saved.count === 0) return true;
    const row = await tx.webhookEvent.findUniqueOrThrow({
      where: {
        provider_eventId: { provider: input.provider, eventId: input.eventId.slice(0, 200) },
      },
      select: { id: true },
    });
    await enqueue(
      input.provider === "razorpay" ? "webhook.razorpay" : "webhook.shiprocket",
      { webhookEventId: row.id },
      { tx },
    );
    return false;
  });
  if (duplicate)
    logger.info("webhook.duplicate", { provider: input.provider, eventId: input.eventId });
  else await kickJobs();
  return { duplicate };
}

async function loadEvent(webhookEventId: string, provider: string) {
  const event = await db.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!event || event.provider !== provider)
    throw new PermanentJobError(`Webhook event ${webhookEventId} not found`);
  return event;
}

// ───────────────────────── processing (job handlers) ─────────────────────────

/** Runs a saved Razorpay event. Every step is idempotent, so a retry is always safe. */
export async function processRazorpayEvent(webhookEventId: string): Promise<void> {
  const saved = await loadEvent(webhookEventId, "razorpay");
  const parsed = razorpayWebhookSchema.safeParse(saved.payload);
  if (!parsed.success) throw new PermanentJobError("Razorpay event has an unexpected shape");
  const event = parsed.data;
  const raw = saved.payload as Prisma.InputJsonValue;
  const payment = event.payload.payment?.entity;
  const { markOrderPaid, markPaymentFailed } = await import("@/services/order.service");
  const { markRefundFailed, markRefundProcessed } = await import("@/services/refund.service");

  let outcome: string;
  if (event.event === "payment.captured" && payment) {
    outcome = (
      await markOrderPaid({
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        amountInPaise: payment.amount,
        method: payment.method,
        rawPayload: raw,
        source: "webhook",
      })
    ).outcome;
  } else if (event.event === "payment.failed" && payment) {
    outcome = (
      await markPaymentFailed({
        razorpayOrderId: payment.order_id,
        razorpayPaymentId: payment.id,
        reason: payment.error_description ?? payment.error_reason ?? "Payment failed",
        rawPayload: raw,
      })
    ).outcome;
  } else if (
    (event.event === "refund.processed" || event.event === "refund.failed") &&
    event.payload.refund
  ) {
    const refund = event.payload.refund.entity;
    const refundRef =
      refund.notes && !Array.isArray(refund.notes) ? refund.notes.refundRef : undefined;
    outcome =
      event.event === "refund.processed"
        ? await markRefundProcessed({ razorpayRefundId: refund.id, refundRef, raw })
        : await markRefundFailed({
            razorpayRefundId: refund.id,
            refundRef,
            reason: "Refund failed at the bank",
            raw,
          });
  } else {
    outcome = "ignored";
  }
  await db.webhookEvent.update({ where: { id: saved.id }, data: { processedAt: new Date() } });
  logger.info("webhook.razorpay_processed", {
    event: event.event,
    eventId: saved.eventId,
    outcome,
  });
}

/** Runs a saved Shiprocket tracking event (idempotent: timeline rows are unique). */
export async function processShiprocketEvent(webhookEventId: string): Promise<void> {
  const saved = await loadEvent(webhookEventId, "shiprocket");
  const parsed = shiprocketWebhookSchema.safeParse(saved.payload);
  if (!parsed.success) throw new PermanentJobError("Shiprocket event has an unexpected shape");
  const payload = parsed.data;
  const now = saved.receivedAt;
  const { applyTrackingUpdate } = await import("@/services/shipment.service");
  const result = await applyTrackingUpdate({
    awb: payload.awb,
    statusId: payload.current_status_id ?? payload.shipment_status_id ?? null,
    statusLabel: payload.current_status ?? payload.shipment_status ?? null,
    occurredAt: parseShiprocketDate(payload.current_timestamp, now),
    scans: (payload.scans ?? []).map((s) => ({
      label: s.activity || s["sr-status-label"] || "Update", // the courier's readable text first
      statusId: s["sr-status"] != null ? Number(s["sr-status"]) : null,
      location: s.location ?? null,
      occurredAt: parseShiprocketDate(s.date, now),
    })),
    raw: saved.payload as Prisma.InputJsonValue,
  });
  await db.webhookEvent.update({ where: { id: saved.id }, data: { processedAt: new Date() } });
  logger.info("webhook.courier_processed", { awb: payload.awb, result });
}
