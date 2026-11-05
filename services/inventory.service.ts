import "server-only";
import type { Prisma } from "@prisma/client";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Stock holds while customers pay — per VARIANT (Phase 17).
 *
 *   available = variant.stock − variant.reservedStock
 *
 * Every change is ONE conditional UPDATE ("… WHERE stock − reservedStock >= qty"), so Postgres
 * row locks make concurrent buyers queue up: when two people reach for the last piece, exactly
 * one update matches and the other gets 0 rows. These are parameterised tagged-template queries
 * (Prisma can't compare two columns in a `where`), never string-built SQL.
 *
 * After variant rows change, the product's summary columns (stock / reservedStock / "from" price)
 * are recomputed in the SAME transaction by syncProductSummaries().
 *
 * Lock order (prevents deadlocks): variant rows first, sorted by (productId, variantId), then
 * product rows sorted by id. Every code path that writes both must follow this order.
 */

export const RESERVATION_MINUTES = config.inventory.reservation_minutes;

type Tx = Prisma.TransactionClient;
export interface ReserveLine {
  productId: string;
  variantId: string;
  quantity: number;
}

export class InsufficientStockError extends Error {
  constructor(readonly variantId: string) {
    super("Some items just sold out. Please review your cart.");
  }
}

export function availableStock(row: { stock: number; reservedStock: number }): number {
  return Math.max(0, row.stock - row.reservedStock);
}

export function reservationDeadline(now = new Date()): Date {
  return new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
}

/** Fixed lock order: by product, then variant. */
export function lockOrder<T extends { productId: string; variantId: string }>(lines: T[]): T[] {
  return [...lines].sort(
    (a, b) => a.productId.localeCompare(b.productId) || a.variantId.localeCompare(b.variantId),
  );
}

/**
 * Recomputes each product's summary from its ACTIVE variants: total stock, total held stock
 * (capped at stock, so product-level "available" = sum of variant availability) and the lowest
 * price. A product with no active variants shows stock 0 and keeps its last price.
 */
export async function syncProductSummaries(tx: Tx, productIds: string[]): Promise<void> {
  for (const productId of [...new Set(productIds)].sort()) {
    await tx.$executeRaw`
      UPDATE "Product" p SET
        "stock" = COALESCE((SELECT SUM(v."stock") FROM "ProductVariant" v
                             WHERE v."productId" = p."id" AND v."isActive"), 0),
        "reservedStock" = COALESCE((SELECT SUM(LEAST(v."reservedStock", v."stock")) FROM "ProductVariant" v
                                     WHERE v."productId" = p."id" AND v."isActive"), 0),
        "priceInPaise" = COALESCE((SELECT MIN(v."priceInPaise") FROM "ProductVariant" v
                                    WHERE v."productId" = p."id" AND v."isActive"), p."priceInPaise"),
        -- Sale badge (Phase 24): the "was" price of the variant giving the "from" price, so the
        -- card's price and its % off always describe the same piece. Only when it's a real saving.
        "compareAtPriceInPaise" = (SELECT CASE WHEN v."compareAtPriceInPaise" > v."priceInPaise"
                                               THEN v."compareAtPriceInPaise" END
                                     FROM "ProductVariant" v
                                    WHERE v."productId" = p."id" AND v."isActive"
                                    ORDER BY v."priceInPaise", v."position", v."id" LIMIT 1),
        "updatedAt" = NOW()
      WHERE p."id" = ${productId}`;
  }
}

/** Holds stock for every line, or throws InsufficientStockError (caller's transaction rolls back). */
export async function reserveLines(tx: Tx, lines: ReserveLine[]): Promise<void> {
  for (const line of lockOrder(lines)) {
    const updated = await tx.$executeRaw`
      UPDATE "ProductVariant" v
         SET "reservedStock" = v."reservedStock" + ${line.quantity}, "updatedAt" = NOW()
       WHERE v."id" = ${line.variantId}
         AND v."productId" = ${line.productId}
         AND v."isActive" = true
         AND v."stock" - v."reservedStock" >= ${line.quantity}
         AND EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = v."productId" AND p."isActive" = true)`;
    if (updated === 0) throw new InsufficientStockError(line.variantId);
  }
  await syncProductSummaries(
    tx,
    lines.map((l) => l.productId),
  );
}

/** Gives held stock back (expired, failed or cancelled order). Never goes below 0. */
async function unreserveLines(tx: Tx, lines: ReserveLine[]): Promise<void> {
  for (const line of lockOrder(lines)) {
    await tx.$executeRaw`
      UPDATE "ProductVariant"
         SET "reservedStock" = GREATEST("reservedStock" - ${line.quantity}, 0), "updatedAt" = NOW()
       WHERE "id" = ${line.variantId}`;
  }
  await syncProductSummaries(
    tx,
    lines.map((l) => l.productId),
  );
}

/** Puts units back on the shelf (cancelled paid order, approved return). */
export async function restockLines(tx: Tx, lines: ReserveLine[]): Promise<void> {
  // Anyone waiting for these pieces gets their "back in stock" email soon (Phase 20).
  const { nudgeStockAlerts } = await import("@/services/marketing.service");
  await nudgeStockAlerts(tx);
  const real = lines.filter((l) => l.quantity > 0);
  for (const line of lockOrder(real)) {
    await tx.$executeRaw`
      UPDATE "ProductVariant"
         SET "stock" = "stock" + ${line.quantity}, "updatedAt" = NOW()
       WHERE "id" = ${line.variantId}`;
  }
  await syncProductSummaries(
    tx,
    real.map((l) => l.productId),
  );
}

const lineSelect = { productId: true, variantId: true, quantity: true } as const;

/**
 * On PAID: turns the hold into a real stock decrease (stock −q, reserved −q).
 * If the hold had already expired, takes from available stock instead — or throws if it's gone.
 */
export async function convertReservation(
  tx: Tx,
  orderId: string,
  state: "ACTIVE" | "RELEASED" | "NONE",
): Promise<void> {
  const lines = await tx.orderItem.findMany({ where: { orderId }, select: lineSelect });
  for (const line of lockOrder(lines)) {
    const updated =
      state === "ACTIVE"
        ? await tx.$executeRaw`
            UPDATE "ProductVariant"
               SET "stock" = "stock" - ${line.quantity},
                   "reservedStock" = GREATEST("reservedStock" - ${line.quantity}, 0),
                   "updatedAt" = NOW()
             WHERE "id" = ${line.variantId} AND "stock" >= ${line.quantity}`
        : await tx.$executeRaw`
            UPDATE "ProductVariant"
               SET "stock" = "stock" - ${line.quantity}, "updatedAt" = NOW()
             WHERE "id" = ${line.variantId} AND "stock" - "reservedStock" >= ${line.quantity}`;
    if (updated === 0) throw new InsufficientStockError(line.variantId);
  }
  await syncProductSummaries(
    tx,
    lines.map((l) => l.productId),
  );
  await tx.order.update({
    where: { id: orderId },
    data: { reservationState: "CONVERTED", reservedUntil: null },
  });
}

/**
 * Releases an order's hold exactly once (the ACTIVE → RELEASED switch is conditional).
 * Returns true if this call released it.
 */
export async function releaseReservation(tx: Tx, orderId: string): Promise<boolean> {
  const switched = await tx.order.updateMany({
    where: { id: orderId, reservationState: "ACTIVE" },
    data: { reservationState: "RELEASED", reservedUntil: null },
  });
  if (switched.count === 0) return false;
  const lines = await tx.orderItem.findMany({ where: { orderId }, select: lineSelect });
  await unreserveLines(tx, lines);
  return true;
}

/** Holds stock again for an unpaid order whose hold was released (customer retries payment). */
export async function renewReservation(orderId: string): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      const switched = await tx.order.updateMany({
        where: {
          id: orderId,
          reservationState: { in: ["RELEASED", "NONE"] },
          status: { in: ["PENDING", "FAILED"] },
        },
        data: { reservationState: "ACTIVE", reservedUntil: reservationDeadline() },
      });
      if (switched.count === 0) return;
      const lines = await tx.orderItem.findMany({ where: { orderId }, select: lineSelect });
      await reserveLines(tx, lines);
    });
    return true;
  } catch (error) {
    if (error instanceof InsufficientStockError) return false;
    throw error;
  }
}

/** Extends an active hold (customer came back to pay within the window). */
export async function extendReservation(orderId: string): Promise<void> {
  await db.order.updateMany({
    where: { id: orderId, reservationState: "ACTIVE" },
    data: { reservedUntil: reservationDeadline() },
  });
}

/**
 * Closes unpaid orders whose 15-minute hold has passed and gives their stock back.
 * Safe to run any number of times, in parallel (each order is released at most once).
 */
export async function releaseExpiredReservations(
  now = new Date(),
  limit = 200,
): Promise<{ released: number }> {
  const expired = await db.order.findMany({
    where: { reservationState: "ACTIVE", reservedUntil: { lt: now } },
    select: { id: true },
    orderBy: { reservedUntil: "asc" },
    take: limit,
  });

  let released = 0;
  for (const { id } of expired) {
    const done = await db.$transaction(async (tx) => {
      const ok = await releaseReservation(tx, id);
      if (ok) {
        await tx.order.updateMany({
          where: { id, status: { in: ["PENDING", "FAILED"] } },
          data: {
            status: "CANCELLED",
            expiredAt: now,
            cancellationReason: `Payment not completed within ${RESERVATION_MINUTES} minutes`,
          },
        });
      }
      return ok;
    });
    if (done) released++;
  }
  if (released > 0) logger.info("inventory.reservations_released", { released });
  return { released };
}
