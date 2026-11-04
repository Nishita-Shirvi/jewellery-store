import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Cash on delivery after the parcel is delivered (Phase 18).
 *
 * The courier collects the cash and Shiprocket remits it to the store a few days later. When
 * it arrives, an admin records it here: the order gets paidAt (so it counts in revenue from that
 * day) and a COD Payment row (so returns can be refunded and tracked like any other payment).
 */

/** Statuses in which a delivered COD order can still have its cash recorded. */
const AFTER_DELIVERY = ["DELIVERED", "RETURN_REQUESTED", "REFUND_PENDING", "REFUNDED"] as const;

export class CodError extends Error {}

/**
 * Records cash received for the given delivered COD orders. Each order is recorded at most
 * once (conditional update on paidAt IS NULL + unique payment id), so double clicks and two
 * admins at once are harmless. Returns how many were newly recorded.
 */
export async function markCashReceived(
  orderIds: string[],
  adminId: string,
  reference?: string,
): Promise<{ recorded: number; skipped: number }> {
  let recorded = 0;
  for (const orderId of [...new Set(orderIds)].sort()) {
    const done = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { totalInPaise: true },
      });
      if (!order) return false;
      const switched = await tx.order.updateMany({
        where: {
          id: orderId,
          paymentMethod: "COD",
          paidAt: null,
          status: { in: [...AFTER_DELIVERY] },
        },
        data: { paidAt: new Date() },
      });
      if (switched.count === 0) return false;
      await tx.payment.create({
        data: {
          orderId,
          provider: "COD",
          providerOrderId: `cod_${orderId}`,
          providerPaymentId: `cod_${orderId}`,
          status: "CAPTURED",
          amountInPaise: order.totalInPaise,
          method: "cod",
          rawPayload: { recordedBy: adminId, reference: reference?.slice(0, 120) ?? null },
        },
      });
      return true;
    });
    if (done) recorded++;
  }
  logger.info("cod.cash_recorded", { adminId, recorded, requested: orderIds.length });
  return { recorded, skipped: orderIds.length - recorded };
}

/** Delivered COD orders whose cash hasn't been recorded yet, oldest first, plus parcels still out. */
export async function codOverview() {
  const [awaitingCash, inTransit, refusedCustomers] = await Promise.all([
    db.order.findMany({
      where: { paymentMethod: "COD", paidAt: null, status: { in: [...AFTER_DELIVERY] } },
      orderBy: [{ deliveredAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        totalInPaise: true,
        deliveredAt: true,
        user: { select: { email: true } },
        shipment: { select: { awb: true, courier: true } },
      },
      take: 200,
    }),
    db.order.aggregate({
      where: { paymentMethod: "COD", status: { in: ["CONFIRMED", "SHIPPED"] } },
      _sum: { totalInPaise: true },
      _count: true,
    }),
    db.user.count({ where: { codRefusals: { gt: 0 } } }),
  ]);
  return {
    awaitingCash,
    awaitingCashInPaise: awaitingCash.reduce((s, o) => s + o.totalInPaise, 0),
    inTransitCount: inTransit._count,
    inTransitInPaise: inTransit._sum.totalInPaise ?? 0,
    refusedCustomers,
  };
}
