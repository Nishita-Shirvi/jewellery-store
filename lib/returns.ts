import type { OrderStatus, ReturnReason } from "@prisma/client";

/** Pure return/refund rules (unit-tested). Money in paise. */

export const RETURN_WINDOW_DAYS = 7;

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  DAMAGED: "Arrived damaged",
  WRONG_ITEM: "Wrong item sent",
  NOT_AS_DESCRIBED: "Not as described",
  SIZE_ISSUE: "Size doesn't fit",
  CHANGED_MIND: "Changed my mind",
  OTHER: "Other",
};

/** Our mistake → we also refund the shipping fee when everything is returned. */
const OUR_FAULT: ReturnReason[] = ["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED"];

export interface ReturnableLine {
  orderItemId: string;
  quantity: number;
  returnedQuantity: number;
  priceInPaise: number;
  isReturnable: boolean;
  /** What was paid for the whole line after any coupon (defaults to price × quantity). */
  netLineInPaise?: number;
}

export type Eligibility = { ok: true; deadline: Date } | { ok: false; reason: string };

export function returnEligibility(
  order: { status: OrderStatus; deliveredAt: Date | null; hasOpenReturn: boolean },
  lines: ReturnableLine[],
  now = new Date(),
): Eligibility {
  if (order.hasOpenReturn)
    return { ok: false, reason: "A return for this order is already being reviewed." };
  if (order.status !== "DELIVERED")
    return { ok: false, reason: "Returns are possible only after delivery." };
  if (!order.deliveredAt)
    return { ok: false, reason: "Delivery date unknown — please contact us." };
  const deadline = new Date(order.deliveredAt.getTime() + RETURN_WINDOW_DAYS * 86_400_000);
  if (now > deadline)
    return { ok: false, reason: `The ${RETURN_WINDOW_DAYS}-day return window has ended.` };
  if (!lines.some((l) => l.isReturnable && l.quantity - l.returnedQuantity > 0)) {
    return { ok: false, reason: "Nothing in this order can be returned." };
  }
  return { ok: true, deadline };
}

export interface RequestedLine {
  orderItemId: string;
  quantity: number;
}

/** Validates what the customer selected; returns an error message or null. */
export function validateReturnSelection(
  lines: ReturnableLine[],
  requested: RequestedLine[],
): string | null {
  if (requested.length === 0) return "Choose at least one item to return.";
  const byId = new Map(lines.map((l) => [l.orderItemId, l]));
  for (const r of requested) {
    const line = byId.get(r.orderItemId);
    if (!line) return "One of the selected items isn't in this order.";
    if (!line.isReturnable) return "One of the selected items can't be returned.";
    if (r.quantity < 1 || r.quantity > line.quantity - line.returnedQuantity)
      return "Check the quantities you selected.";
  }
  return null;
}

/** Refund for a return: item prices × quantities, plus shipping if it was our fault and everything comes back. */
export function returnRefundAmount(
  lines: ReturnableLine[],
  requested: RequestedLine[],
  reason: ReturnReason,
  shippingInPaise: number,
): number {
  const byId = new Map(lines.map((l) => [l.orderItemId, l]));
  // Refund what was actually paid for each line (after any coupon), pro rata per unit.
  const items = requested.reduce((sum, r) => {
    const line = byId.get(r.orderItemId);
    if (!line) return sum;
    const net = line.netLineInPaise ?? line.priceInPaise * line.quantity;
    return sum + Math.round((net * r.quantity) / line.quantity);
  }, 0);
  const remainingAfter = lines.reduce((sum, l) => {
    const req = requested.find((r) => r.orderItemId === l.orderItemId)?.quantity ?? 0;
    return sum + (l.quantity - l.returnedQuantity - req);
  }, 0);
  const shipping = OUR_FAULT.includes(reason) && remainingAfter === 0 ? shippingInPaise : 0;
  return items + shipping;
}

/** Order status once a refund is confirmed. */
export function statusAfterRefund(totalInPaise: number, refundedInPaise: number): OrderStatus {
  return refundedInPaise >= totalInPaise ? "REFUNDED" : "DELIVERED";
}
