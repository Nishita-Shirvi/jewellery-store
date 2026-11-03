import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PermanentJobError, type JobType } from "@/services/jobs.service";

/**
 * What each background job does. Every handler is idempotent (safe to run again after a crash
 * or a retry) and throws to ask for a retry; PermanentJobError means "retrying won't help".
 * Imported lazily by the job runner, so services can enqueue jobs without import cycles.
 */

const orderEvent = z.enum([
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "return_requested",
  "return_approved",
  "return_rejected",
  "refund_processed",
]);
const id = z.string().regex(/^[a-z0-9]{1,40}$/i);

function parse<T extends z.ZodTypeAny>(schema: T, payload: Prisma.JsonValue): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new PermanentJobError("Job payload has an unexpected shape");
  return parsed.data;
}

const handlers: Record<JobType, (payload: Prisma.JsonValue) => Promise<void>> = {
  "email.order": async (payload) => {
    const p = parse(
      z.object({
        orderId: id,
        event: orderEvent,
        extra: z
          .object({ amountInPaise: z.number().int().optional(), note: z.string().optional() })
          .default({}),
      }),
      payload,
    );
    const { deliverOrderEmail } = await import("@/services/notification.service");
    await deliverOrderEmail(p.orderId, p.event, p.extra);
  },

  "sms.order": async (payload) => {
    const p = parse(z.object({ orderId: id, event: orderEvent }), payload);
    const { deliverOrderSms } = await import("@/services/notification.service");
    await deliverOrderSms(p.orderId, p.event);
  },

  "invoice.create": async (payload) => {
    const p = parse(z.object({ orderId: id }), payload);
    const { createInvoiceForOrder } = await import("@/services/invoice.service");
    if (await createInvoiceForOrder(p.orderId)) return;
    const order = await db.order.findUnique({
      where: { id: p.orderId },
      select: { paidAt: true, paymentMethod: true },
    });
    if (!order || (!order.paidAt && order.paymentMethod !== "COD"))
      throw new PermanentJobError("Order isn't invoiceable");
    throw new Error("Invoice not created yet (see invoice.* log lines)");
  },

  "shipment.create": async (payload) => {
    const p = parse(z.object({ orderId: id, adminId: z.string().max(40) }), payload);
    const { createShipmentForOrder, ShipmentError } = await import("@/services/shipment.service");
    const { isShiprocketConfigured } = await import("@/lib/env");
    if (!isShiprocketConfigured) throw new PermanentJobError("Shiprocket isn't set up yet");
    try {
      await createShipmentForOrder(p.orderId, p.adminId);
    } catch (error) {
      // Order no longer shippable (cancelled, already shipped …): retrying won't change that.
      if (error instanceof ShipmentError && /Only paid|not found/i.test(error.message))
        throw new PermanentJobError(error.message);
      throw error;
    }
  },

  "webhook.razorpay": async (payload) => {
    const p = parse(z.object({ webhookEventId: id }), payload);
    const { processRazorpayEvent } = await import("@/services/webhook.service");
    await processRazorpayEvent(p.webhookEventId);
  },

  "webhook.shiprocket": async (payload) => {
    const p = parse(z.object({ webhookEventId: id }), payload);
    const { processShiprocketEvent } = await import("@/services/webhook.service");
    await processShiprocketEvent(p.webhookEventId);
  },

  "alerts.low_stock": async () => {
    const { sendLowStockAlert } = await import("@/services/alert.service");
    await sendLowStockAlert();
  },

  "email.marketing": async (payload) => {
    const p = parse(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("newsletter_confirm"),
          to: z.email(),
          token: z.string().min(20).max(64),
        }),
        z.object({ kind: z.literal("cart_reminder"), reminderId: id }),
        z.object({ kind: z.literal("back_in_stock"), alertId: id }),
        z.object({ kind: z.literal("referral_reward"), referralId: id }),
        z.object({
          kind: z.literal("staff_invite"),
          inviteId: id,
          token: z.string().min(20).max(64),
        }),
      ]),
      payload,
    );
    const { deliverMarketingEmail } = await import("@/services/marketing-email.service");
    await deliverMarketingEmail(p);
  },

  "marketing.scan": async () => {
    const { runMarketingScan } = await import("@/services/marketing.service");
    await runMarketingScan();
  },

  "reservations.release": async () => {
    const { releaseExpiredReservations } = await import("@/services/inventory.service");
    const result = await releaseExpiredReservations();
    if (result.released > 0) {
      const { revalidateTag } = await import("next/cache");
      const { CATALOG_TAG } = await import("@/services/catalog.service");
      revalidateTag(CATALOG_TAG);
    }
  },
};

export async function runJobHandler(type: string, payload: Prisma.JsonValue): Promise<void> {
  const handler = handlers[type as JobType];
  if (!handler) throw new PermanentJobError(`Unknown job type "${type}"`);
  await handler(payload);
}
