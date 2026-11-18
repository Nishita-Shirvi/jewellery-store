import "server-only";
import { config } from "@/lib/config";
import { revalidateTag } from "next/cache";
import type { Prisma, ReturnReason } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  returnEligibility,
  returnRefundAmount,
  validateReturnSelection,
  type RequestedLine,
  type ReturnableLine,
} from "@/lib/returns";
import { CATALOG_TAG } from "@/services/catalog.service";
import { sendOrderUpdateEmail } from "@/services/email.service";
import { createRefundRecord, issueRefund } from "@/services/refund.service";

export class ReturnError extends Error {}

type Tx = Prisma.TransactionClient;

async function restockItems(tx: Tx, items: { productId: string; quantity: number }[]) {
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }
}

// ───────────────────────── Cancellations ─────────────────────────

type ShipmentLock = {
  awb: string | null;
  providerShipmentId: string | null;
  status: string;
} | null;

/**
 * True once a courier parcel exists (Shiprocket shipment id or AWB) and wasn't cancelled at the
 * courier: cancelling + refunding then would still let the parcel ship.
 */
function hasLiveShipment(shipment: ShipmentLock): boolean {
  return Boolean(
    shipment && (shipment.providerShipmentId || shipment.awb) && shipment.status !== "CANCELLED",
  );
}

const shipmentLockSelect = { awb: true, providerShipmentId: true, status: true } as const;

function liveShipmentError(by: "customer" | "admin", shipment: NonNullable<ShipmentLock>) {
  return new ReturnError(
    by === "customer"
      ? "Your order is already packed for the courier. Please contact us to cancel."
      : `A courier shipment already exists for this order${shipment.awb ? ` (AWB ${shipment.awb})` : ""}. Cancel it in Shiprocket first, then cancel the order here.`,
  );
}

/** Can this paid order still be cancelled? (Not once it has a courier shipment/AWB or has shipped.) */
export async function canCustomerCancel(orderId: string): Promise<boolean> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, shipment: { select: shipmentLockSelect } },
  });
  return order?.status === "PAID" && !hasLiveShipment(order.shipment);
}

/**
 * Cancels a PAID order before it ships: stock goes back, a full refund is sent to Razorpay.
 * The PAID → REFUND_PENDING switch is conditional, so double clicks / two admins can't refund twice.
 */
export async function cancelPaidOrder(input: {
  orderId: string;
  by: "customer" | "admin";
  actorId: string;
  userId?: string;
}) {
  const order = await db.order.findFirst({
    where: { id: input.orderId, ...(input.userId ? { userId: input.userId } : {}) },
    include: {
      items: { select: { id: true, productId: true, quantity: true } },
      shipment: { select: shipmentLockSelect },
    },
  });
  if (!order) throw new ReturnError("Order not found.");
  if (order.status !== "PAID")
    throw new ReturnError("Only paid orders that haven't shipped can be cancelled.");
  if (hasLiveShipment(order.shipment)) throw liveShipmentError(input.by, order.shipment!);

  const refundId = await db.$transaction(async (tx) => {
    const switched = await tx.order.updateMany({
      where: { id: order.id, status: "PAID" },
      data: {
        status: "REFUND_PENDING",
        cancellationReason:
          input.by === "customer" ? "Cancelled by the customer" : "Cancelled by the store",
      },
    });
    if (switched.count === 0)
      throw new ReturnError("This order changed in the meantime. Please refresh.");
    // Re-check under the order row lock: createShipmentForOrder saves the Shiprocket ids while
    // holding the same lock, so a shipment created a moment ago is seen here (→ rollback).
    const shipment = await tx.shipment.findUnique({
      where: { orderId: order.id },
      select: shipmentLockSelect,
    });
    if (hasLiveShipment(shipment)) throw liveShipmentError(input.by, shipment!);
    await restockItems(tx, order.items);
    for (const item of order.items) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { returnedQuantity: item.quantity },
      });
    }
    return createRefundRecord(tx, {
      orderId: order.id,
      amountInPaise: order.totalInPaise,
      reason: "Order cancelled before shipping",
    });
  });

  revalidateTag(CATALOG_TAG);
  logger.info("order.cancelled_with_refund", {
    orderId: order.id,
    by: input.by,
    actorId: input.actorId,
    refundId,
  });
  await issueRefund(refundId);
  await sendOrderUpdateEmail(order.id, "cancelled", { amountInPaise: order.totalInPaise });
}

// ─────────────────────────── Returns ─────────────────────────────

async function returnContext(orderId: string, userId?: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    include: {
      items: { include: { product: { select: { isReturnable: true } } } },
      returns: { select: { status: true } },
    },
  });
  if (!order) return null;
  const lines: ReturnableLine[] = order.items.map((i) => ({
    orderItemId: i.id,
    quantity: i.quantity,
    returnedQuantity: i.returnedQuantity,
    priceInPaise: i.priceInPaise,
    isReturnable: i.product.isReturnable,
    netLineInPaise: i.lineTotalInPaise - i.discountInPaise,
  }));
  const eligibility = returnEligibility(
    {
      status: order.status,
      // Orders delivered before Phase 11 have no deliveredAt; their last update is the delivery.
      deliveredAt: order.deliveredAt ?? (order.status === "DELIVERED" ? order.updatedAt : null),
      hasOpenReturn: order.returns.some((r) => r.status === "REQUESTED"),
    },
    lines,
    new Date(),
    config.returns.window_days,
  );
  return { order, lines, eligibility };
}

/** For the customer's return form. */
export async function getReturnOptions(userId: string, orderId: string) {
  const ctx = await returnContext(orderId, userId);
  if (!ctx) return null;
  return {
    eligibility: ctx.eligibility,
    items: ctx.order.items.map((i) => ({
      orderItemId: i.id,
      name: i.productName,
      priceInPaise: i.priceInPaise,
      returnable: i.product.isReturnable,
      remaining: i.quantity - i.returnedQuantity,
    })),
  };
}

export async function requestReturn(
  userId: string,
  orderId: string,
  input: { reason: ReturnReason; details?: string; photoUrl?: string; items: RequestedLine[] },
) {
  const ctx = await returnContext(orderId, userId);
  if (!ctx) throw new ReturnError("Order not found.");
  if (!ctx.eligibility.ok) throw new ReturnError(ctx.eligibility.reason);
  const problem = validateReturnSelection(ctx.lines, input.items);
  if (problem) throw new ReturnError(problem);

  const created = await db.$transaction(async (tx) => {
    const switched = await tx.order.updateMany({
      where: { id: orderId, status: "DELIVERED" },
      data: { status: "RETURN_REQUESTED" },
    });
    if (switched.count === 0)
      throw new ReturnError("This order changed in the meantime. Please refresh.");
    return tx.returnRequest.create({
      data: {
        orderId,
        userId,
        reason: input.reason,
        details: input.details,
        photoUrl: input.photoUrl,
        items: {
          create: input.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
        },
      },
      select: { id: true },
    });
  });
  logger.info("return.requested", { orderId, returnId: created.id, userId });
  await sendOrderUpdateEmail(orderId, "return_requested");
  return created;
}

/** Admin approves: items marked returned, optional restock, refund sent. Conditional, so it can't run twice. */
export async function approveReturn(
  returnId: string,
  adminId: string,
  options: { restock: boolean; note?: string },
) {
  const request = await db.returnRequest.findUnique({
    where: { id: returnId },
    include: { items: { include: { orderItem: true } }, order: { include: { items: true } } },
  });
  if (!request) throw new ReturnError("Return not found.");
  if (request.status !== "REQUESTED")
    throw new ReturnError("This return has already been decided.");

  const lines: ReturnableLine[] = request.order.items.map((i) => ({
    orderItemId: i.id,
    quantity: i.quantity,
    returnedQuantity: i.returnedQuantity,
    priceInPaise: i.priceInPaise,
    isReturnable: true,
    netLineInPaise: i.lineTotalInPaise - i.discountInPaise,
  }));
  const requested = request.items.map((i) => ({
    orderItemId: i.orderItemId,
    quantity: i.quantity,
  }));
  const amount = returnRefundAmount(
    lines,
    requested,
    request.reason,
    request.order.shippingInPaise,
  );

  const refundId = await db.$transaction(async (tx) => {
    const decided = await tx.returnRequest.updateMany({
      where: { id: returnId, status: "REQUESTED" },
      data: {
        status: "APPROVED",
        restock: options.restock,
        adminNote: options.note,
        decidedAt: new Date(),
      },
    });
    if (decided.count === 0) throw new ReturnError("This return has already been decided.");
    await tx.order.updateMany({
      where: { id: request.orderId, status: "RETURN_REQUESTED" },
      data: { status: "REFUND_PENDING" },
    });
    for (const item of request.items) {
      const marked = await tx.orderItem.updateMany({
        where: {
          id: item.orderItemId,
          returnedQuantity: { lte: item.orderItem.quantity - item.quantity },
        },
        data: { returnedQuantity: { increment: item.quantity } },
      });
      if (marked.count === 0) throw new ReturnError("Some of these items were already returned.");
    }
    if (options.restock)
      await restockItems(
        tx,
        request.items.map((i) => ({ productId: i.orderItem.productId, quantity: i.quantity })),
      );
    return createRefundRecord(tx, {
      orderId: request.orderId,
      amountInPaise: amount,
      reason: `Return approved (${request.reason})`,
      returnRequestId: returnId,
    });
  });

  if (options.restock) revalidateTag(CATALOG_TAG);
  logger.info("return.approved", {
    returnId,
    adminId,
    amountInPaise: amount,
    restock: options.restock,
  });
  await issueRefund(refundId);
  await sendOrderUpdateEmail(request.orderId, "return_approved", { amountInPaise: amount });
}

export async function rejectReturn(returnId: string, adminId: string, note: string) {
  const request = await db.returnRequest.findUnique({
    where: { id: returnId },
    select: { orderId: true },
  });
  if (!request) throw new ReturnError("Return not found.");
  await db.$transaction(async (tx) => {
    const decided = await tx.returnRequest.updateMany({
      where: { id: returnId, status: "REQUESTED" },
      data: { status: "REJECTED", adminNote: note, decidedAt: new Date() },
    });
    if (decided.count === 0) throw new ReturnError("This return has already been decided.");
    await tx.order.updateMany({
      where: { id: request.orderId, status: "RETURN_REQUESTED" },
      data: { status: "DELIVERED" },
    });
  });
  logger.info("return.rejected", { returnId, adminId });
  await sendOrderUpdateEmail(request.orderId, "return_rejected", { note });
}

export async function getReturnsAndRefunds(orderId: string) {
  const [returns, refunds] = await Promise.all([
    db.returnRequest.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { orderItem: { select: { productName: true } } } } },
    }),
    db.refund.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { returns, refunds };
}

export async function listReturnsAdmin(status?: string) {
  const valid = ["REQUESTED", "APPROVED", "REJECTED"].includes(status ?? "")
    ? (status as "REQUESTED" | "APPROVED" | "REJECTED")
    : undefined;
  return db.returnRequest.findMany({
    where: valid ? { status: valid } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: { select: { id: true, user: { select: { email: true } } } },
      _count: { select: { items: true } },
    },
  });
}
