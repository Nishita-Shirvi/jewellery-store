import type { OrderStatus } from "@prisma/client";

/**
 * Which status changes an admin may make. Everything else is refused on the server.
 * PENDING → PAID and → FAILED only happen through payments, never by hand.
 * (Phase 11 adds refund and return statuses.)
 */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CANCELLED"],
  FAILED: ["CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Payment failed",
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 border-amber-200",
  PAID: "bg-blue-50 text-blue-800 border-blue-200",
  SHIPPED: "bg-violet-50 text-violet-800 border-violet-200",
  DELIVERED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CANCELLED: "bg-neutral-100 text-neutral-700 border-neutral-200",
  FAILED: "bg-red-50 text-red-800 border-red-200",
};

/** Customers see paid orders and later; unpaid attempts stay hidden from their history. */
export const CUSTOMER_VISIBLE_STATUSES: OrderStatus[] = [
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];
