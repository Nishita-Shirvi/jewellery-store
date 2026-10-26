import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { materialSummary } from "@/lib/jewellery";
import { logger } from "@/lib/logger";
import { createRazorpayOrder } from "@/lib/payments/razorpay";
import { addressSnapshot, getAddressForUser } from "@/services/address.service";
import { getCartView } from "@/services/cart.service";
import { sendOrderConfirmationEmail } from "@/services/email.service";
import { getShippingRule } from "@/lib/shipping-config";
import { getBusiness } from "@/lib/business";
import { isIntraState, taxForLine } from "@/lib/gst";
import { createInvoiceForOrder } from "@/services/invoice.service";
import { allocateDiscount } from "@/lib/coupons";
import { CouponLimitReached, checkCoupon, redeemCouponInTx } from "@/services/coupon.service";
import { shippingFeeFor } from "@/lib/shipping-fee";
import { checkPincode } from "@/services/shipment.service";
import {
  InsufficientStockError,
  convertReservation,
  extendReservation,
  releaseExpiredReservations,
  releaseReservation,
  renewReservation,
  reservationDeadline,
  reserveLines,
} from "@/services/inventory.service";
import { revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/services/catalog.service";

/** Short reference shown to customers, e.g. #K3F9Q2ZA. */
export function displayOrderNumber(orderId: string): string {
  return `#${orderId.slice(-8).toUpperCase()}`;
}

export interface PaymentSession {
  orderId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  keyId: string;
  prefill: { name: string; email: string; contact: string };
}

export type CheckoutResult = { ok: true; session: PaymentSession } | { ok: false; error: string };

/**
 * Step 2 of checkout. Creates a PENDING order with price snapshots (totals recalculated
 * on the server) and a Razorpay order. Same checkoutKey = same order (double-click safe).
 */
export async function startCheckout(
  user: { id: string; email: string | null; name: string | null },
  input: { addressId: string; checkoutKey: string; couponCode?: string },
): Promise<CheckoutResult> {
  if (!env.RAZORPAY_KEY_ID) return { ok: false, error: "Online payments are not set up yet." };

  // Double click / retry with the same key → return the existing order.
  const existing = await db.order.findUnique({
    where: { checkoutKey: input.checkoutKey },
    select: { id: true, userId: true, status: true },
  });
  if (existing) {
    if (existing.userId !== user.id) return { ok: false, error: "Invalid checkout session." };
    return resumePayment(user, existing.id);
  }

  const address = await getAddressForUser(user.id, input.addressId);
  if (!address) return { ok: false, error: "Please choose a delivery address." };

  // Free up holds that have run out, so expired carts never block a real buyer.
  await releaseExpiredReservations();

  const cart = await getCartView(user.id);
  if (cart.itemCount === 0) return { ok: false, error: "Your cart is empty." };
  if (cart.hasIssues) {
    return { ok: false, error: "Some items in your cart changed. Please review your cart." };
  }

  // Don't take money for an address no courier can reach (skipped when Shiprocket isn't set up or is down).
  const pincode = await checkPincode(address.pincode);
  if (pincode.status === "not_serviceable") {
    return {
      ok: false,
      error: `Sorry, we can't deliver to pincode ${address.pincode} yet. Please choose another address.`,
    };
  }

  const intraState = isIntraState(getBusiness().state, address.state);
  const subtotal = cart.items.reduce((sum, item) => sum + item.unitPriceInPaise * item.quantity, 0);
  // Free-shipping threshold uses the subtotal before any coupon.
  const shippingFee = shippingFeeFor(subtotal, getShippingRule());

  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const coupon = await checkCoupon(input.couponCode, user.id, subtotal);
    if (!coupon.ok) return { ok: false, error: coupon.error };
    discount = coupon.discountInPaise;
    couponId = coupon.couponId ?? null;
    couponCode = coupon.code ?? null;
  }
  const lineShares = allocateDiscount(
    cart.items.map((i) => i.unitPriceInPaise * i.quantity),
    discount,
  );
  const total = subtotal - discount + shippingFee;

  let order: { id: string };
  try {
    order = await db.$transaction(async (tx) => {
      // Re-read price and stock inside the transaction: the cart view could be a moment old.
      const products = await tx.product.findMany({
        where: { id: { in: cart.items.map((i) => i.productId) }, isActive: true },
        select: {
          id: true,
          name: true,
          slug: true,
          priceInPaise: true,
          stock: true,
          metalType: true,
          purity: true,
          metalColour: true,
          netWeightMg: true,
          grossWeightMg: true,
          gemstone: true,
          huid: true,
          hsnCode: true,
          gstRateBps: true,
        },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
      let recomputed = 0;
      for (const [index, line] of cart.items.entries()) {
        const p = byId.get(line.productId);
        if (!p || p.stock < line.quantity)
          throw new CheckoutConflict("Some items just sold out. Please review your cart.");
        if (p.priceInPaise !== line.unitPriceInPaise)
          throw new CheckoutConflict("A price just changed. Please review your cart.");
        recomputed += p.priceInPaise * line.quantity;
        items.push({
          product: { connect: { id: p.id } },
          productName: p.name,
          productSlug: p.slug,
          priceInPaise: p.priceInPaise,
          quantity: line.quantity,
          lineTotalInPaise: p.priceInPaise * line.quantity,
          hsnCode: p.hsnCode,
          gstRateBps: p.gstRateBps,
          discountInPaise: lineShares[index] ?? 0,
          ...gstSnapshot(
            p.priceInPaise * line.quantity - (lineShares[index] ?? 0),
            p.gstRateBps,
            intraState,
          ),
          productSnapshot: {
            metalType: p.metalType,
            purity: p.purity,
            metalColour: p.metalColour,
            netWeightMg: p.netWeightMg,
            grossWeightMg: p.grossWeightMg,
            gemstone: p.gemstone,
            huid: p.huid,
            materialSummary: materialSummary(p),
          },
        });
      }
      if (recomputed !== subtotal)
        throw new CheckoutConflict("Your cart changed. Please review it.");

      const created = await tx.order.create({
        data: {
          userId: user.id,
          status: "PENDING",
          reservationState: "ACTIVE",
          reservedUntil: reservationDeadline(),
          subtotalInPaise: subtotal,
          shippingInPaise: shippingFee,
          totalInPaise: total,
          addressSnapshot: addressSnapshot(address),
          checkoutKey: input.checkoutKey,
          couponId,
          couponCode,
          discountInPaise: discount,
          items: { create: items },
        },
        select: { id: true },
      });
      // Hold the stock for [inventory] reservation_minutes (atomic; rolls back the whole order if anything is gone).
      await reserveLines(
        tx,
        cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      );
      return created;
    });
  } catch (error) {
    if (error instanceof CheckoutConflict || error instanceof InsufficientStockError) {
      return { ok: false, error: error.message };
    }
    if ((error as { code?: string }).code === "P2002") return resumeByKey(user, input.checkoutKey);
    throw error;
  }
  logger.info("checkout.order_created", {
    orderId: order.id,
    userId: user.id,
    totalInPaise: total,
  });

  try {
    const rzp = await createRazorpayOrder({
      amountInPaise: total,
      receipt: order.id,
      notes: { orderId: order.id },
    });
    await db.payment.create({
      data: { orderId: order.id, providerOrderId: rzp.id, amountInPaise: total, status: "CREATED" },
    });
    logger.info("checkout.razorpay_order_created", { orderId: order.id, razorpayOrderId: rzp.id });
    return { ok: true, session: sessionFor(user, order.id, rzp.id, total) };
  } catch (error) {
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
      await releaseReservation(tx, order.id);
    });
    logger.error("checkout.razorpay_order_failed", {
      orderId: order.id,
      error,
    });
    return { ok: false, error: "We couldn't reach the payment provider. Please try again." };
  }
}

class CheckoutConflict extends Error {}

function gstSnapshot(totalInPaise: number, rateBps: number, intraState: boolean) {
  const t = taxForLine(totalInPaise, rateBps, intraState);
  return {
    taxableValueInPaise: t.taxableInPaise,
    cgstInPaise: t.cgstInPaise,
    sgstInPaise: t.sgstInPaise,
    igstInPaise: t.igstInPaise,
  };
}

async function resumeByKey(
  user: { id: string; email: string | null; name: string | null },
  key: string,
) {
  const order = await db.order.findUnique({
    where: { checkoutKey: key },
    select: { id: true, userId: true },
  });
  if (!order || order.userId !== user.id)
    return { ok: false as const, error: "Invalid checkout session." };
  return resumePayment(user, order.id);
}

function sessionFor(
  user: { email: string | null; name: string | null },
  orderId: string,
  razorpayOrderId: string,
  amountInPaise: number,
  contact = "",
): PaymentSession {
  return {
    orderId,
    razorpayOrderId,
    amountInPaise,
    keyId: env.RAZORPAY_KEY_ID ?? "",
    prefill: { name: user.name ?? "", email: user.email ?? "", contact },
  };
}

/** Lets the customer pay again for an unpaid order (popup closed or payment failed). */
export async function resumePayment(
  user: { id: string; email: string | null; name: string | null },
  orderId: string,
): Promise<CheckoutResult> {
  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id },
    select: {
      id: true,
      status: true,
      totalInPaise: true,
      addressSnapshot: true,
      reservationState: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { providerOrderId: true } },
    },
  });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "PAID") return { ok: false, error: "This order is already paid." };
  if (order.status !== "PENDING" && order.status !== "FAILED") {
    return {
      ok: false,
      error: "This order expired or was cancelled. Please check out again from your cart.",
    };
  }
  // Keep (or re-take) the stock hold while the customer pays.
  if (order.reservationState === "ACTIVE") {
    await extendReservation(order.id);
  } else if (!(await renewReservation(order.id))) {
    return {
      ok: false,
      error: "Sorry, a piece in this order just sold out. Please review your cart.",
    };
  }
  const payment = order.payments[0];
  if (!payment) return { ok: false, error: "This order can't be paid. Please check out again." };
  const contact = (order.addressSnapshot as { phone?: string } | null)?.phone ?? "";
  return {
    ok: true,
    session: sessionFor(user, order.id, payment.providerOrderId, order.totalInPaise, contact),
  };
}

export type PaymentSource = "callback" | "webhook";

/**
 * Marks an order PAID and reduces stock in ONE transaction. Idempotent: callback and webhook
 * can both arrive (in any order, even at the same time) and only the first one does anything.
 */
export async function markOrderPaid(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountInPaise?: number;
  method?: string;
  rawPayload: Prisma.InputJsonValue;
  source: PaymentSource;
}): Promise<{
  outcome: "paid" | "already_processed" | "unknown_order" | "sold_out" | "amount_mismatch";
  orderId?: string;
}> {
  const payment = await db.payment.findUnique({
    where: { providerOrderId: input.razorpayOrderId },
    select: { id: true, orderId: true, amountInPaise: true },
  });
  if (!payment) {
    logger.warn("payment.unknown_razorpay_order", {
      razorpayOrderId: input.razorpayOrderId,
      source: input.source,
    });
    return { outcome: "unknown_order" };
  }
  const log = {
    orderId: payment.orderId,
    razorpayPaymentId: input.razorpayPaymentId,
    source: input.source,
  };

  if (input.amountInPaise !== undefined && input.amountInPaise !== payment.amountInPaise) {
    logger.error("payment.amount_mismatch", {
      ...log,
      expected: payment.amountInPaise,
      received: input.amountInPaise,
    });
    return { outcome: "amount_mismatch", orderId: payment.orderId };
  }

  try {
    const transitioned = await db.$transaction(async (tx) => {
      // Conditional update = row lock. A concurrent second call waits, then matches 0 rows.
      // An order closed only because its 15-minute hold expired can still be paid late.
      const before = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { reservationState: true },
      });
      const updated = await tx.order.updateMany({
        where: {
          id: payment.orderId,
          OR: [
            { status: { in: ["PENDING", "FAILED"] } },
            { status: "CANCELLED", expiredAt: { not: null } },
          ],
        },
        data: { status: "PAID", paidAt: new Date(), expiredAt: null, cancellationReason: null },
      });
      if (updated.count === 0) return false;

      const items = await tx.orderItem.findMany({
        where: { orderId: payment.orderId },
        select: { productId: true, quantity: true },
      });
      const paidOrder = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { id: true, userId: true, couponId: true, discountInPaise: true },
      });
      await redeemCouponInTx(tx, paidOrder);

      try {
        await convertReservation(
          tx,
          payment.orderId,
          before.reservationState === "ACTIVE" ? "ACTIVE" : "RELEASED",
        );
      } catch (error) {
        if (error instanceof InsufficientStockError) throw new SoldOutAfterPayment();
        throw error;
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "CAPTURED",
          providerPaymentId: input.razorpayPaymentId,
          method: input.method,
          failureReason: null,
          rawPayload: input.rawPayload,
        },
      });

      // Clear only what was bought (the customer may have added more since).
      const { userId } = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        select: { userId: true },
      });
      await tx.cartItem.deleteMany({
        where: { cart: { userId }, productId: { in: items.map((i) => i.productId) } },
      });
      return true;
    });

    if (!transitioned) {
      logger.info("payment.already_processed", log);
      return { outcome: "already_processed", orderId: payment.orderId };
    }
    logger.info("payment.order_paid", log);
    const { countFunnel } = await import("@/services/report.service");
    await countFunnel("purchase");
    revalidateTag(CATALOG_TAG); // stock changed
    await createInvoiceForOrder(payment.orderId).catch(() => null); // logged inside; never blocks payment
    await sendConfirmation(payment.orderId);
    return { outcome: "paid", orderId: payment.orderId };
  } catch (error) {
    if (error instanceof SoldOutAfterPayment) return handleSoldOut(payment, input, log);
    if (error instanceof CouponLimitReached) {
      return handleSoldOut(
        payment,
        input,
        log,
        "Coupon limit reached after payment — refunded in full",
      );
    }
    if ((error as { code?: string }).code === "P2002") {
      // providerPaymentId already stored on another row: duplicate delivery.
      logger.info("payment.duplicate_payment_id", log);
      return { outcome: "already_processed", orderId: payment.orderId };
    }
    throw error;
  }
}

class SoldOutAfterPayment extends Error {}

/** Paid, but someone else bought the last piece first. Cancel and flag for refund (automated in Phase 11). */
async function handleSoldOut(
  payment: { id: string; orderId: string },
  input: { razorpayPaymentId: string; method?: string; rawPayload: Prisma.InputJsonValue },
  log: Record<string, unknown>,
  reason = "Sold out after payment — refunded in full",
) {
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: {
        id: payment.orderId,
        OR: [
          { status: { in: ["PENDING", "FAILED"] } },
          { status: "CANCELLED", expiredAt: { not: null } },
        ],
      },
      data: {
        status: "CANCELLED",
        expiredAt: null,
        cancellationReason: reason,
      },
    });
    await releaseReservation(tx, payment.orderId);
    return result;
  });
  if (updated.count > 0) {
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "CAPTURED",
        providerPaymentId: input.razorpayPaymentId,
        method: input.method,
        rawPayload: input.rawPayload,
      },
    });
    logger.error("payment.sold_out_after_payment_refunding", log);
    const { refundSoldOutOrder } = await import("@/services/return.service");
    await refundSoldOutOrder(payment.orderId);
  }
  return { outcome: "sold_out" as const, orderId: payment.orderId };
}

/** payment.failed webhook. Never downgrades a PAID order. */
export async function markPaymentFailed(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  reason: string;
  rawPayload: Prisma.InputJsonValue;
}): Promise<{ outcome: "failed" | "ignored" | "unknown_order" }> {
  const payment = await db.payment.findUnique({
    where: { providerOrderId: input.razorpayOrderId },
    select: { id: true, orderId: true, status: true },
  });
  if (!payment) return { outcome: "unknown_order" };
  if (payment.status === "CAPTURED") return { outcome: "ignored" };

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: payment.orderId, status: "PENDING" },
      data: { status: "FAILED" },
    });
    // Give the stock back; a retry takes it again if it's still available.
    if (result.count > 0) await releaseReservation(tx, payment.orderId);
    return result;
  });
  await db.payment.updateMany({
    where: { id: payment.id, status: { not: "CAPTURED" } },
    data: {
      status: "FAILED",
      failureReason: input.reason.slice(0, 300),
      rawPayload: input.rawPayload,
    },
  });
  logger.warn("payment.failed", {
    orderId: payment.orderId,
    razorpayPaymentId: input.razorpayPaymentId,
    reason: input.reason,
  });
  return { outcome: updated.count > 0 ? "failed" : "ignored" };
}

async function sendConfirmation(orderId: string) {
  await sendOrderConfirmationEmail({ orderId });
}

export interface OrderSummary {
  id: string;
  displayNumber: string;
  status: OrderStatus;
  totalInPaise: number;
  subtotalInPaise: number;
  shippingInPaise: number;
  discountInPaise: number;
  couponCode: string | null;
  createdAt: Date;
  paidAt: Date | null;
  cancellationReason: string | null;
  address: {
    fullName: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  items: {
    name: string;
    slug: string;
    quantity: number;
    priceInPaise: number;
    lineTotalInPaise: number;
  }[];
}

/** An order the signed-in user owns, or null (never another user's order). */
export async function getOrderForUser(
  userId: string,
  orderId: string,
): Promise<OrderSummary | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, userId },
    include: { items: true },
  });
  if (!order) return null;
  return {
    id: order.id,
    displayNumber: displayOrderNumber(order.id),
    status: order.status,
    totalInPaise: order.totalInPaise,
    subtotalInPaise: order.subtotalInPaise,
    shippingInPaise: order.shippingInPaise,
    discountInPaise: order.discountInPaise,
    couponCode: order.couponCode,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    cancellationReason: order.cancellationReason,
    address: order.addressSnapshot as OrderSummary["address"],
    items: order.items.map((i) => ({
      name: i.productName,
      slug: i.productSlug,
      quantity: i.quantity,
      priceInPaise: i.priceInPaise,
      lineTotalInPaise: i.lineTotalInPaise,
    })),
  };
}

export const CUSTOMER_ORDERS_PAGE_SIZE = 10;

/** The customer's order history (paid orders and later; unpaid attempts are hidden). */
export async function listOrdersForUser(userId: string, page: number) {
  const where = {
    userId,
    status: { in: ["PAID", "SHIPPED", "DELIVERED", "CANCELLED"] as OrderStatus[] },
  };
  const [total, orders] = await db.$transaction([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * CUSTOMER_ORDERS_PAGE_SIZE,
      take: CUSTOMER_ORDERS_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        totalInPaise: true,
        createdAt: true,
        items: { select: { productName: true, quantity: true }, take: 3 },
        _count: { select: { items: true } },
      },
    }),
  ]);
  return {
    orders: orders.map((o) => ({ ...o, displayNumber: displayOrderNumber(o.id) })),
    total,
    pageCount: Math.max(1, Math.ceil(total / CUSTOMER_ORDERS_PAGE_SIZE)),
  };
}
