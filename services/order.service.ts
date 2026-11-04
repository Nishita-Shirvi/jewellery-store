import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { materialSummary } from "@/lib/jewellery";
import { variantJewellery } from "@/lib/variants";
import { logger } from "@/lib/logger";
import { createRazorpayOrder } from "@/lib/payments/razorpay";
import {
  addressSnapshot,
  getAddressForUser,
  openSnapshot,
  sealSnapshot,
} from "@/services/address.service";
import { getCartView } from "@/services/cart.service";
import { getShippingRule } from "@/lib/shipping-config";
import { getBusiness } from "@/lib/business";
import { isIntraState, taxForLine } from "@/lib/gst";
import { allocateDiscount } from "@/lib/coupons";
import { CouponLimitReached, checkCoupon, redeemCouponInTx } from "@/services/coupon.service";
import { shippingFeeFor } from "@/lib/shipping-fee";
import { checkCodPincode, checkPincode } from "@/services/shipment.service";
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
import { enqueue, kickJobs } from "@/services/jobs.service";
import { notifyOrder } from "@/services/notification.service";
import { config } from "@/lib/config";
import {
  codDecision,
  maskMobile,
  normaliseMobile,
  parsePincodeList,
  type CodRules,
} from "@/lib/cod";
import { OtpError, checkOtp, consumeOtp, otpAvailable, sendOtp } from "@/services/otp.service";
import { CATALOG_TAG } from "@/services/catalog.service";
import { addMetric } from "@/lib/metrics";

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

type Buyer = { id: string; email: string | null; name: string | null };
type CheckoutAddress = NonNullable<Awaited<ReturnType<typeof getAddressForUser>>>;

/** Server-side totals for the current cart. Never trusts anything the browser sent. */
interface PricedCheckout {
  cart: Awaited<ReturnType<typeof getCartView>>;
  subtotal: number;
  shippingFee: number;
  discount: number;
  couponId: string | null;
  couponCode: string | null;
  lineShares: number[];
  intraState: boolean;
}

async function priceCheckout(
  user: Buyer,
  address: CheckoutAddress,
  couponInput?: string,
): Promise<{ ok: true; priced: PricedCheckout } | { ok: false; error: string }> {
  const cart = await getCartView(user.id);
  if (cart.itemCount === 0) return { ok: false, error: "Your cart is empty." };
  if (cart.hasIssues) {
    return { ok: false, error: "Some items in your cart changed. Please review your cart." };
  }
  const intraState = isIntraState(getBusiness().state, address.state);
  const subtotal = cart.items.reduce((sum, item) => sum + item.unitPriceInPaise * item.quantity, 0);
  // Free-shipping threshold uses the subtotal before any coupon.
  const shippingFee = shippingFeeFor(subtotal, getShippingRule());

  let discount = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (couponInput) {
    const coupon = await checkCoupon(couponInput, user.id, subtotal);
    if (!coupon.ok) return { ok: false, error: coupon.error };
    discount = coupon.discountInPaise;
    couponId = coupon.couponId ?? null;
    couponCode = coupon.code ?? null;
  }
  const lineShares = allocateDiscount(
    cart.items.map((i) => i.unitPriceInPaise * i.quantity),
    discount,
  );
  return {
    ok: true,
    priced: { cart, subtotal, shippingFee, discount, couponId, couponCode, lineShares, intraState },
  };
}

/**
 * Inside a transaction: re-reads every variant's price and stock, snapshots the lines, creates
 * the order and holds the stock. Throws CheckoutConflict / InsufficientStockError → rollback.
 */
async function insertOrderTx(
  tx: Prisma.TransactionClient,
  input: {
    user: Buyer;
    address: CheckoutAddress;
    priced: PricedCheckout;
    checkoutKey: string;
    paymentMethod: "ONLINE" | "COD";
    codFeeInPaise: number;
  },
): Promise<{ id: string; totalInPaise: number }> {
  const { cart, subtotal, shippingFee, discount, lineShares, intraState } = input.priced;
  // Re-read price and stock inside the transaction: the cart view could be a moment old.
  const variants = await tx.productVariant.findMany({
    where: {
      id: { in: cart.items.map((i) => i.variantId) },
      isActive: true,
      product: { isActive: true },
    },
    select: {
      id: true,
      productId: true,
      sku: true,
      label: true,
      priceInPaise: true,
      stock: true,
      purity: true,
      metalColour: true,
      netWeightMg: true,
      grossWeightMg: true,
      product: {
        select: {
          name: true,
          slug: true,
          metalType: true,
          purity: true,
          metalColour: true,
          gemstone: true,
          huid: true,
          hsnCode: true,
          gstRateBps: true,
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
  let recomputed = 0;
  for (const [index, line] of cart.items.entries()) {
    const v = byId.get(line.variantId);
    if (!v || v.productId !== line.productId || v.stock < line.quantity)
      throw new CheckoutConflict("Some items just sold out. Please review your cart.");
    if (v.priceInPaise !== line.unitPriceInPaise)
      throw new CheckoutConflict("A price just changed. Please review your cart.");
    const p = v.product;
    const facts = variantJewellery(p, v);
    recomputed += v.priceInPaise * line.quantity;
    items.push({
      product: { connect: { id: v.productId } },
      variant: { connect: { id: v.id } },
      sku: v.sku,
      variantLabel: v.label,
      productName: p.name,
      productSlug: p.slug,
      priceInPaise: v.priceInPaise,
      quantity: line.quantity,
      lineTotalInPaise: v.priceInPaise * line.quantity,
      hsnCode: p.hsnCode,
      gstRateBps: p.gstRateBps,
      discountInPaise: lineShares[index] ?? 0,
      ...gstSnapshot(
        v.priceInPaise * line.quantity - (lineShares[index] ?? 0),
        p.gstRateBps,
        intraState,
      ),
      productSnapshot: {
        ...facts,
        gemstone: p.gemstone,
        huid: p.huid,
        sku: v.sku,
        variantLabel: v.label,
        materialSummary: materialSummary(facts),
      },
    });
  }
  if (recomputed !== subtotal) throw new CheckoutConflict("Your cart changed. Please review it.");

  const total = subtotal - discount + shippingFee + input.codFeeInPaise;
  const created = await tx.order.create({
    data: {
      userId: input.user.id,
      status: input.paymentMethod === "COD" ? "CONFIRMED" : "PENDING",
      paymentMethod: input.paymentMethod,
      codFeeInPaise: input.codFeeInPaise,
      reservationState: "ACTIVE",
      reservedUntil: reservationDeadline(),
      subtotalInPaise: subtotal,
      shippingInPaise: shippingFee,
      totalInPaise: total,
      addressSnapshot: sealSnapshot(addressSnapshot(input.address)),
      checkoutKey: input.checkoutKey,
      couponId: input.priced.couponId,
      couponCode: input.priced.couponCode,
      discountInPaise: discount,
      items: { create: items },
    },
    select: { id: true },
  });
  // Hold the stock (atomic; rolls back the whole order if anything is gone).
  await reserveLines(
    tx,
    cart.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      quantity: i.quantity,
    })),
  );
  return { id: created.id, totalInPaise: total };
}

/**
 * Step 2 of checkout. Creates a PENDING order with price snapshots (totals recalculated
 * on the server) and a Razorpay order. Same checkoutKey = same order (double-click safe).
 */
export async function startCheckout(
  user: Buyer,
  input: { addressId: string; checkoutKey: string; couponCode?: string },
): Promise<CheckoutResult> {
  if (!env.RAZORPAY_KEY_ID) return { ok: false, error: "Online payments are not set up yet." };

  // Double click / retry with the same key → return the existing order.
  const existing = await db.order.findUnique({
    where: { checkoutKey: input.checkoutKey },
    select: { id: true, userId: true, status: true, paymentMethod: true },
  });
  if (existing) {
    if (existing.userId !== user.id || existing.paymentMethod !== "ONLINE")
      return { ok: false, error: "Invalid checkout session." };
    return resumePayment(user, existing.id);
  }

  const address = await getAddressForUser(user.id, input.addressId);
  if (!address) return { ok: false, error: "Please choose a delivery address." };

  // Free up holds that have run out, so expired carts never block a real buyer.
  await releaseExpiredReservations();

  const pricing = await priceCheckout(user, address, input.couponCode);
  if (!pricing.ok) return pricing;

  // Don't take money for an address no courier can reach (skipped when Shiprocket isn't set up or is down).
  const pincode = await checkPincode(address.pincode);
  if (pincode.status === "not_serviceable") {
    return {
      ok: false,
      error: `Sorry, we can't deliver to pincode ${address.pincode} yet. Please choose another address.`,
    };
  }

  let order: { id: string; totalInPaise: number };
  try {
    order = await db.$transaction((tx) =>
      insertOrderTx(tx, {
        user,
        address,
        priced: pricing.priced,
        checkoutKey: input.checkoutKey,
        paymentMethod: "ONLINE",
        codFeeInPaise: 0,
      }),
    );
  } catch (error) {
    if (error instanceof CheckoutConflict || error instanceof InsufficientStockError) {
      return { ok: false, error: error.message };
    }
    if ((error as { code?: string }).code === "P2002") return resumeByKey(user, input.checkoutKey);
    throw error;
  }
  const total = order.totalInPaise;
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
    // Phase 26: a gateway outage must alert within minutes, not at the next cron run.
    await addMetric("payments.gateway_error");
    await (await import("@/services/monitor.service")).checkSoon(["payments"]);
    return { ok: false, error: "We couldn't reach the payment provider. Please try again." };
  }
}

// ───────────────────────── Cash on delivery (Phase 18) ─────────────────────────

const codRules = (): CodRules => ({
  enabled: config.cod.enabled,
  maxOrderInPaise: config.cod.max_order_rupees * 100,
  feeInPaise: config.cod.fee_rupees * 100,
  pincodes: parsePincodeList(config.cod.pincodes),
  maxRefusals: config.cod.max_refusals,
  otpRequired: config.cod.otp_required,
});

export type CodQuote =
  | { ok: true; feeInPaise: number; totalInPaise: number; phone: string; otpRequired: boolean }
  | { ok: false; reason: string };

/** Is COD possible for this cart + address (+ coupon)? Every rule is checked again on placing. */
async function decideCod(
  user: Buyer,
  address: CheckoutAddress,
  priced: PricedCheckout,
): Promise<CodQuote> {
  const phone = normaliseMobile(address.phone);
  if (!phone)
    return { ok: false, reason: "Add a valid 10-digit mobile number to this address for COD." };
  const [buyer, courier] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { codRefusals: true } }),
    checkCodPincode(address.pincode),
  ]);
  const decision = codDecision(codRules(), {
    totalBeforeFeeInPaise: priced.subtotal - priced.discount + priced.shippingFee,
    pincode: address.pincode,
    refusals: buyer?.codRefusals ?? 0,
    otpAvailable: otpAvailable(),
    courierCod: courier,
  });
  if (!decision.ok) return decision;
  return {
    ok: true,
    feeInPaise: decision.feeInPaise,
    totalInPaise: decision.totalInPaise,
    phone,
    otpRequired: config.cod.otp_required,
  };
}

export async function quoteCod(
  user: Buyer,
  input: { addressId: string; couponCode?: string },
): Promise<CodQuote> {
  const address = await getAddressForUser(user.id, input.addressId);
  if (!address) return { ok: false, reason: "Please choose a delivery address." };
  const pricing = await priceCheckout(user, address, input.couponCode);
  if (!pricing.ok) return { ok: false, reason: pricing.error };
  return decideCod(user, address, pricing.priced);
}

/** Sends the COD confirmation code to the delivery address's mobile number. */
export async function sendCodOtp(
  user: Buyer,
  input: { addressId: string; couponCode?: string },
): Promise<{ ok: true; challengeId: string; sentTo: string } | { ok: false; error: string }> {
  const quote = await quoteCod(user, input);
  if (!quote.ok) return { ok: false, error: quote.reason };
  try {
    const { challengeId } = await sendOtp(user.id, quote.phone, "cod");
    return { ok: true, challengeId, sentTo: maskMobile(quote.phone) };
  } catch (error) {
    if (error instanceof OtpError) return { ok: false, error: error.message };
    throw error;
  }
}

export type CodOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

/**
 * Places a cash-on-delivery order: every rule re-checked, OTP verified, then ONE transaction
 * creates the CONFIRMED order, takes the stock for good, redeems the coupon, uses up the code
 * and clears the bought lines from the cart. Same checkoutKey twice = the same order.
 */
export async function placeCodOrder(
  user: Buyer,
  input: {
    addressId: string;
    checkoutKey: string;
    couponCode?: string;
    challengeId?: string;
    code?: string;
  },
): Promise<CodOrderResult> {
  const sameKey = async (): Promise<CodOrderResult | null> => {
    const found = await db.order.findUnique({
      where: { checkoutKey: input.checkoutKey },
      select: { id: true, userId: true, paymentMethod: true },
    });
    if (!found) return null;
    return found.userId === user.id && found.paymentMethod === "COD"
      ? { ok: true, orderId: found.id }
      : { ok: false, error: "Invalid checkout session." };
  };
  const existing = await sameKey();
  if (existing) return existing;

  const address = await getAddressForUser(user.id, input.addressId);
  if (!address) return { ok: false, error: "Please choose a delivery address." };
  await releaseExpiredReservations();
  const pricing = await priceCheckout(user, address, input.couponCode);
  if (!pricing.ok) return pricing;
  const pincode = await checkPincode(address.pincode);
  if (pincode.status === "not_serviceable")
    return { ok: false, error: `Sorry, we can't deliver to pincode ${address.pincode} yet.` };

  const quote = await decideCod(user, address, pricing.priced);
  if (!quote.ok) return { ok: false, error: quote.reason };

  const otpRequired = config.cod.otp_required;
  if (otpRequired) {
    if (!input.challengeId || !input.code)
      return { ok: false, error: "Enter the code we sent to your mobile." };
    try {
      await checkOtp({
        challengeId: input.challengeId,
        userId: user.id,
        phone: quote.phone,
        purpose: "cod",
        code: input.code,
      });
    } catch (error) {
      if (error instanceof OtpError) return { ok: false, error: error.message };
      throw error;
    }
  }

  let order: { id: string; totalInPaise: number };
  try {
    order = await db.$transaction(async (tx) => {
      const created = await insertOrderTx(tx, {
        user,
        address,
        priced: pricing.priced,
        checkoutKey: input.checkoutKey,
        paymentMethod: "COD",
        codFeeInPaise: quote.feeInPaise,
      });
      if (created.totalInPaise !== quote.totalInPaise)
        throw new CheckoutConflict("Your cart changed. Please review it.");
      // Nothing to wait for: the hold becomes a sale in the same transaction.
      await convertReservation(tx, created.id, "ACTIVE");
      await redeemCouponInTx(tx, {
        id: created.id,
        userId: user.id,
        couponId: pricing.priced.couponId,
        discountInPaise: pricing.priced.discount,
      });
      if (otpRequired && !(await consumeOtp(tx, input.challengeId!, user.id)))
        throw new CheckoutConflict("This code was already used. Please send a new one.");
      await tx.cartItem.deleteMany({
        where: {
          cart: { userId: user.id },
          variantId: { in: pricing.priced.cart.items.map((i) => i.variantId) },
        },
      });
      await queueAfterOrder(tx, created.id);
      return created;
    });
  } catch (error) {
    if (error instanceof CheckoutConflict || error instanceof InsufficientStockError)
      return { ok: false, error: error.message };
    if (error instanceof CouponLimitReached)
      return { ok: false, error: "This coupon has just reached its limit. Please remove it." };
    if ((error as { code?: string }).code === "P2002")
      return (await sameKey()) ?? { ok: false, error: "Invalid checkout session." };
    throw error;
  }

  logger.info("checkout.cod_order_placed", {
    orderId: order.id,
    userId: user.id,
    totalInPaise: order.totalInPaise,
  });
  const { countFunnel } = await import("@/services/report.service");
  await countFunnel("purchase");
  revalidateTag(CATALOG_TAG); // stock changed
  await kickJobs(); // invoice + email after the response is sent
  return { ok: true, orderId: order.id };
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

async function resumeByKey(user: Buyer, key: string) {
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
  const contact = openSnapshot(order.addressSnapshot).phone ?? "";
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
        select: { variantId: true },
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
        where: { cart: { userId }, variantId: { in: items.map((i) => i.variantId) } },
      });
      // Invoice PDF data + confirmation email run in the background (queued in THIS transaction).
      await queueAfterOrder(tx, payment.orderId);
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
    await kickJobs(); // invoice + email after the response is sent; never blocks payment
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

/** Background work after an order is paid / confirmed — queued inside the order's transaction. */
async function queueAfterOrder(tx: Prisma.TransactionClient, orderId: string) {
  await enqueue("invoice.create", { orderId }, { tx, dedupeKey: `invoice:${orderId}` });
  await notifyOrder(orderId, "confirmed", {}, tx);
}

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
  await (await import("@/services/monitor.service")).checkSoon(["payments"]);
  return { outcome: updated.count > 0 ? "failed" : "ignored" };
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
  paymentMethod: "ONLINE" | "COD";
  codFeeInPaise: number;
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
    sku: string;
    variantLabel: string;
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
    paymentMethod: order.paymentMethod,
    codFeeInPaise: order.codFeeInPaise,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    cancellationReason: order.cancellationReason,
    address: openSnapshot(order.addressSnapshot) as OrderSummary["address"],
    items: order.items.map((i) => ({
      name: i.productName,
      slug: i.productSlug,
      sku: i.sku,
      variantLabel: i.variantLabel,
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
    status: {
      in: ["CONFIRMED", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"] as OrderStatus[],
    },
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
