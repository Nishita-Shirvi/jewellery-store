import "server-only";
import type { Prisma } from "@prisma/client";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Stock holds while customers pay.
 *
 *   available = stock − reservedStock
 *
 * Every change is ONE conditional UPDATE ("… WHERE stock − reservedStock >= qty"), so Postgres
 * row locks make concurrent buyers queue up: when two people reach for the last piece, exactly
 * one update matches and the other gets 0 rows. These are parameterised tagged-template queries
 * (Prisma can't compare two columns in a `where`), never string-built SQL.
 */

export const RESERVATION_MINUTES = config.inventory.reservation_minutes;

type Tx = Prisma.TransactionClient;
export interface ReserveLine {
  productId: string;
  quantity: number;
}

export class InsufficientStockError extends Error {
  constructor(readonly productId: string) {
    super("Some items just sold out. Please review your cart.");
  }
}

export function availableStock(product: { stock: number; reservedStock: number }): number {
  return Math.max(0, product.stock - product.reservedStock);
}

export function reservationDeadline(now = new Date()): Date {
  return new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
}

/** Holds stock for every line, or throws InsufficientStockError (caller's transaction rolls back). */
export async function reserveLines(tx: Tx, lines: ReserveLine[]): Promise<void> {
  // Lock rows in a fixed order to avoid deadlocks between two carts with the same items.
  for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const updated = await tx.$executeRaw`
      UPDATE "Product"
         SET "reservedStock" = "reservedStock" + ${line.quantity}, "updatedAt" = NOW()
       WHERE "id" = ${line.productId}
         AND "isActive" = true
         AND "stock" - "reservedStock" >= ${line.quantity}`;
    if (updated === 0) throw new InsufficientStockError(line.productId);
  }
}

/** Gives held stock back (expired, failed or cancelled order). Never goes below 0. */
async function unreserveLines(tx: Tx, lines: ReserveLine[]): Promise<void> {
  for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await tx.$executeRaw`
      UPDATE "Product"
         SET "reservedStock" = GREATEST("reservedStock" - ${line.quantity}, 0), "updatedAt" = NOW()
       WHERE "id" = ${line.productId}`;
  }
}

/**
 * On PAID: turns the hold into a real stock decrease (stock −q, reserved −q).
 * If the hold had already expired, takes from available stock instead — or throws if it's gone.
 */
export async function convertReservation(
  tx: Tx,
  orderId: string,
  state: "ACTIVE" | "RELEASED" | "NONE",
): Promise<void> {
  const lines = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
  for (const line of [...lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const updated =
      state === "ACTIVE"
        ? await tx.$executeRaw`
            UPDATE "Product"
               SET "stock" = "stock" - ${line.quantity},
                   "reservedStock" = GREATEST("reservedStock" - ${line.quantity}, 0),
                   "updatedAt" = NOW()
             WHERE "id" = ${line.productId} AND "stock" >= ${line.quantity}`
        : await tx.$executeRaw`
            UPDATE "Product"
               SET "stock" = "stock" - ${line.quantity}, "updatedAt" = NOW()
             WHERE "id" = ${line.productId} AND "stock" - "reservedStock" >= ${line.quantity}`;
    if (updated === 0) throw new InsufficientStockError(line.productId);
  }
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
  const lines = await tx.orderItem.findMany({
    where: { orderId },
    select: { productId: true, quantity: true },
  });
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
      const lines = await tx.orderItem.findMany({
        where: { orderId },
        select: { productId: true, quantity: true },
      });
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
