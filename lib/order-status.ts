import type { OrderStatus } from "@prisma/client";

/**
 * THE order state machine. Every status change in the app (payments, shipping, admin,
 * customer cancellations, returns, refunds) must be allowed here.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "FAILED", "CANCELLED", "REFUND_PENDING"],
  FAILED: ["PAID", "CANCELLED", "REFUND_PENDING"],
  PAID: ["SHIPPED", "DELIVERED", "REFUND_PENDING"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["REFUND_PENDING", "DELIVERED"], // approved / rejected
  REFUND_PENDING: ["REFUNDED", "DELIVERED"], // all refunded / partial return refunded
  REFUNDED: [],
  CANCELLED: ["PAID", "REFUND_PENDING"], // only an order closed because its hold expired can be paid late
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Status changes an admin can make by hand with a button. Cancelling a PAID order refunds it. */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CANCELLED"],
  FAILED: ["CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  RETURN_REQUESTED: [],
  REFUND_PENDING: [],
  REFUNDED: [],
  CANCELLED: [],
};

export function canAdminTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Payment failed",
  RETURN_REQUESTED: "Return requested",
  REFUND_PENDING: "Refund in progress",
  REFUNDED: "Refunded",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  PAID: "bg-blue-50 text-blue-800 border-blue-200",
  SHIPPED: "bg-violet-50 text-violet-800 border-violet-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CANCELLED: "bg-neutral-100 text-neutral-700 border-neutral-200",
  FAILED: "bg-red-50 text-red-800 border-red-200",
  RETURN_REQUESTED: "bg-orange-50 text-orange-800 border-orange-200",
  REFUND_PENDING: "bg-sky-50 text-sky-800 border-sky-200",
  REFUNDED: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

/** Customers see paid orders and later; unpaid attempts stay hidden from their history. */
export const CUSTOMER_VISIBLE_STATUSES: OrderStatus[] = [
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "REFUND_PENDING",
  "REFUNDED",
];

export const PAID_STATUSES: OrderStatus[] = [
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "RETURN_REQUESTED",
  "REFUND_PENDING",
  "REFUNDED",
];
