import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  RazorpayError,
  createRazorpayRefund,
  listRazorpayRefunds,
  refundRefOf,
  type RazorpayRefund,
} from "@/lib/payments/razorpay";
import { statusAfterRefund } from "@/lib/returns";
import { sendOrderUpdateEmail } from "@/services/email.service";

type Tx = Prisma.TransactionClient;

/**
 * Claim marker. While one caller is talking to Razorpay about a refund, the row is
 * status PENDING + razorpayRefundId null + failureReason = REFUND_SENDING. Only the caller whose
 * conditional update set it may call Razorpay, so concurrent retries can't pay twice.
 */
export const REFUND_SENDING = "Sending to Razorpay…";

/** A claim (or an unsent PENDING refund) older than this is treated as abandoned by a crash. */
export const STUCK_REFUND_MS = 10 * 60_000;

/**
 * Payments that did NOT pay for their order (a second capture on an order that is already paid
 * or cancelled) get their own Payment row with this providerOrderId prefix, because the real
 * Razorpay order id is already taken by the order's own Payment row (unique). They are refunded
 * in full and never count towards the order's refundedInPaise or status.
 */
export const EXTRA_PAYMENT_PREFIX = "extra:";

const notExtraPayment: Prisma.PaymentWhereInput = {
  NOT: { providerOrderId: { startsWith: EXTRA_PAYMENT_PREFIX } },
};

/**
 * Refunds that reduce sales and output GST: money given back on an order that was actually sold
 * (paid). Excludes refunds of extra/duplicate payments (never part of the order's total) and
 * refunds of orders that were never paid (e.g. sold out at payment — never counted as a sale).
 */
export const salesRefundWhere: Prisma.RefundWhereInput = {
  status: "PROCESSED",
  payment: notExtraPayment,
  order: { paidAt: { not: null } },
};

/** Our reference sent to Razorpay: the Refund id, plus ":<attempt>" from the 2nd attempt on. */
export function refundAttemptRef(refundId: string, attempt: number): string {
  return attempt <= 1 ? refundId : `${refundId}:${attempt}`;
}

/** Refund id from a reference created by refundAttemptRef. */
export function baseRefundRef(ref: string | undefined): string | undefined {
  return ref ? ref.split(":")[0] : undefined;
}

/** Whether the admin "Retry refund" button applies (failed, or never sent and stuck). */
export function canRetryRefund(
  refund: { status: string; razorpayRefundId: string | null; updatedAt: Date },
  now = new Date(),
): boolean {
  if (refund.status === "FAILED") return true;
  return (
    refund.status === "PENDING" &&
    !refund.razorpayRefundId &&
    now.getTime() - refund.updatedAt.getTime() > STUCK_REFUND_MS
  );
}

/** Creates a PENDING refund row inside the caller's transaction (Razorpay is called afterwards). */
export async function createRefundRecord(
  tx: Tx,
  input: { orderId: string; amountInPaise: number; reason: string; returnRequestId?: string },
): Promise<string> {
  if (input.amountInPaise <= 0) throw new Error("Refund amount must be positive");
  const payment = await tx.payment.findFirst({
    where: {
      orderId: input.orderId,
      status: "CAPTURED",
      providerPaymentId: { not: null },
      ...notExtraPayment,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, amountInPaise: true },
  });
  if (!payment) throw new Error("No captured payment to refund");

  // Never refund more than was paid, across all refunds for this payment. A FAILED refund is
  // still owed (it will be retried), so it counts too.
  const already = await tx.refund.aggregate({
    where: { paymentId: payment.id, status: { in: ["PENDING", "PROCESSED", "FAILED"] } },
    _sum: { amountInPaise: true },
  });
  if ((already._sum.amountInPaise ?? 0) + input.amountInPaise > payment.amountInPaise) {
    throw new Error("Refund would exceed the amount paid");
  }

  const refund = await tx.refund.create({
    data: {
      orderId: input.orderId,
      paymentId: payment.id,
      amountInPaise: input.amountInPaise,
      reason: input.reason,
      returnRequestId: input.returnRequestId,
    },
    select: { id: true },
  });
  return refund.id;
}

/**
 * Records a captured payment that did not pay for its order (order already paid by another
 * payment, or cancelled) together with a PENDING full refund for it, in one transaction.
 * Idempotent: a redelivered webhook finds the payment already recorded and creates nothing.
 * Returns the new refund's id (null if this call created nothing).
 */
export async function recordExtraPaymentRefund(input: {
  orderId: string;
  razorpayPaymentId: string;
  amountInPaise: number;
  method?: string;
  rawPayload: Prisma.InputJsonValue;
  reason: string;
}): Promise<string | null> {
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { providerPaymentId: input.razorpayPaymentId },
        select: { id: true },
      });
      if (existing) return null;
      const payment = await tx.payment.create({
        data: {
          orderId: input.orderId,
          providerOrderId: `${EXTRA_PAYMENT_PREFIX}${input.razorpayPaymentId}`,
          providerPaymentId: input.razorpayPaymentId,
          status: "CAPTURED",
          amountInPaise: input.amountInPaise,
          method: input.method,
          rawPayload: input.rawPayload,
        },
        select: { id: true },
      });
      const refund = await tx.refund.create({
        data: {
          orderId: input.orderId,
          paymentId: payment.id,
          amountInPaise: input.amountInPaise,
          reason: input.reason,
        },
        select: { id: true },
      });
      return refund.id;
    });
  } catch (error) {
    // A concurrent delivery of the same payment recorded it first.
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

/** Sends this payment's refunds that were created but never reached Razorpay (crash recovery). */
export async function sendUnsentRefunds(paymentRowId: string): Promise<void> {
  const unsent = await db.refund.findMany({
    where: {
      paymentId: paymentRowId,
      status: "PENDING",
      razorpayRefundId: null,
      OR: [{ failureReason: null }, { failureReason: { not: REFUND_SENDING } }],
    },
    select: { id: true },
  });
  for (const r of unsent) await issueRefund(r.id);
}

export const COD_REFUND_NOTE =
  "Cash on delivery: pay the customer back by bank transfer or UPI, then press “Mark as refunded”.";

/**
 * Sends a PENDING/FAILED refund to Razorpay. Safe to call again and concurrently:
 *  1. a conditional update CLAIMS the refund (only one caller goes on);
 *  2. Razorpay is asked for refunds already made with our reference — a lost response is
 *     reused, refunds that failed at the bank are ignored and a new attempt is made with
 *     reference "<refundId>:<attempt>";
 *  3. the result is saved only if the row is still ours (a fast webhook may have won).
 */
export async function issueRefund(
  refundId: string,
): Promise<"sent" | "processed" | "failed" | "skipped" | "manual"> {
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    include: { payment: { select: { providerPaymentId: true, provider: true } } },
  });
  // Razorpay can't refund cash: COD refunds stay PENDING until an admin pays and marks them.
  if (refund?.payment.provider === "COD") {
    if (refund.status !== "PROCESSED")
      await db.refund.update({
        where: { id: refund.id },
        data: { status: "PENDING", failureReason: COD_REFUND_NOTE },
      });
    return "manual";
  }
  if (!refund || refund.status === "PROCESSED" || !refund.payment.providerPaymentId)
    return "skipped";
  if (refund.status === "PENDING" && refund.razorpayRefundId) return "skipped"; // with Razorpay already
  const paymentId = refund.payment.providerPaymentId;

  const claimed = await db.refund.updateMany({
    where: {
      id: refund.id,
      OR: [
        { status: "FAILED" },
        {
          status: "PENDING",
          razorpayRefundId: null,
          OR: [
            { failureReason: null },
            { failureReason: { not: REFUND_SENDING } },
            { updatedAt: { lt: new Date(Date.now() - STUCK_REFUND_MS) } }, // abandoned claim
          ],
        },
      ],
    },
    // A FAILED refund keeps the id of the Razorpay refund that failed: clear it for the new attempt.
    data: { status: "PENDING", razorpayRefundId: null, failureReason: REFUND_SENDING },
  });
  if (claimed.count === 0) return "skipped"; // someone else is sending it right now
  const ours: Prisma.RefundWhereInput = {
    id: refund.id,
    status: "PENDING",
    razorpayRefundId: null,
    failureReason: REFUND_SENDING,
  };

  let rzp: RazorpayRefund;
  try {
    const ourRefunds = (await listRazorpayRefunds(paymentId)).filter(
      (r) => baseRefundRef(refundRefOf(r)) === refund.id,
    );
    const live = ourRefunds.find((r) => r.status !== "failed");
    rzp =
      live ??
      (await createRazorpayRefund(
        paymentId,
        refund.amountInPaise,
        refundAttemptRef(refund.id, ourRefunds.length + 1),
      ));
  } catch (error) {
    const message = error instanceof RazorpayError ? error.message : "Couldn't reach Razorpay";
    await db.refund.updateMany({
      where: ours,
      data: { status: "FAILED", failureReason: message.slice(0, 300) },
    });
    logger.error("refund.failed_to_send", { refundId, orderId: refund.orderId, error });
    return "failed";
  }

  // Conditional: never overwrite a PROCESSED/FAILED that a fast webhook set meanwhile.
  const raw = rzp as unknown as Prisma.InputJsonValue;
  const recorded = await db.refund.updateMany({
    where: ours,
    data: { razorpayRefundId: rzp.id, failureReason: null, rawPayload: raw },
  });
  logger.info("refund.sent", {
    refundId,
    razorpayRefundId: rzp.id,
    orderId: refund.orderId,
    amountInPaise: refund.amountInPaise,
    recorded: recorded.count > 0,
  });
  if (rzp.status === "processed") {
    await markRefundProcessed({ razorpayRefundId: rzp.id, refundRef: refund.id, raw });
    return "processed";
  }
  if (rzp.status === "failed") {
    await markRefundFailed({
      razorpayRefundId: rzp.id,
      refundRef: refund.id,
      reason: "Refund failed at Razorpay",
      raw,
    });
    return "failed";
  }
  return "sent";
}

async function findRefund(match: { razorpayRefundId?: string; refundRef?: string }) {
  if (match.razorpayRefundId) {
    const byId = await db.refund.findUnique({
      where: { razorpayRefundId: match.razorpayRefundId },
    });
    if (byId) return byId;
  }
  const ref = baseRefundRef(match.refundRef);
  return ref ? db.refund.findUnique({ where: { id: ref } }) : null;
}

/**
 * refund.processed (webhook or immediate response). Idempotent: only the first call adds the
 * amount to the order and moves the order to REFUNDED (all back) or DELIVERED (partial return).
 * Refunds of an extra payment (one that never paid for the order) leave the order alone.
 */
export async function markRefundProcessed(input: {
  razorpayRefundId: string;
  refundRef?: string;
  raw: Prisma.InputJsonValue;
}) {
  const refund = await findRefund(input);
  if (!refund) {
    logger.warn("refund.unknown", { razorpayRefundId: input.razorpayRefundId });
    return "unknown" as const;
  }
  if (refund.razorpayRefundId && refund.razorpayRefundId !== input.razorpayRefundId) {
    // A second Razorpay refund for the same row: money may have gone out twice. Needs a human.
    logger.error("refund.processed_for_other_razorpay_refund", {
      refundId: refund.id,
      orderId: refund.orderId,
      stored: refund.razorpayRefundId,
      received: input.razorpayRefundId,
    });
    return "already" as const;
  }

  const result = await db.$transaction(async (tx) => {
    const switched = await tx.refund.updateMany({
      where: { id: refund.id, status: { in: ["PENDING", "FAILED"] } },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        razorpayRefundId: input.razorpayRefundId,
        failureReason: null,
        rawPayload: input.raw,
      },
    });
    if (switched.count === 0) return "already" as const;

    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: refund.paymentId },
      select: { providerOrderId: true },
    });
    if (payment.providerOrderId.startsWith(EXTRA_PAYMENT_PREFIX)) {
      await tx.payment.update({ where: { id: refund.paymentId }, data: { status: "REFUNDED" } });
      return "processed" as const;
    }

    const order = await tx.order.update({
      where: { id: refund.orderId },
      data: { refundedInPaise: { increment: refund.amountInPaise } },
      select: { id: true, totalInPaise: true, refundedInPaise: true },
    });
    const openRefunds = await tx.refund.count({
      where: {
        orderId: order.id,
        status: { in: ["PENDING", "FAILED"] },
        payment: notExtraPayment,
      },
    });
    if (openRefunds === 0) {
      await tx.order.updateMany({
        where: { id: order.id, status: "REFUND_PENDING" },
        data: { status: statusAfterRefund(order.totalInPaise, order.refundedInPaise) },
      });
    }
    await tx.payment.updateMany({
      where: { id: refund.paymentId, amountInPaise: { lte: order.refundedInPaise } },
      data: { status: "REFUNDED" },
    });
    return "processed" as const;
  });

  if (result === "processed") {
    logger.info("refund.processed", {
      refundId: refund.id,
      orderId: refund.orderId,
      amountInPaise: refund.amountInPaise,
    });
    await sendOrderUpdateEmail(refund.orderId, "refund_processed", {
      amountInPaise: refund.amountInPaise,
    });
  }
  return result;
}

/** refund.failed webhook: the admin sees it and can retry. Never undoes a processed refund. */
export async function markRefundFailed(input: {
  razorpayRefundId: string;
  refundRef?: string;
  reason: string;
  raw: Prisma.InputJsonValue;
}) {
  const refund = await findRefund(input);
  if (!refund) return "unknown" as const;
  if (refund.razorpayRefundId && refund.razorpayRefundId !== input.razorpayRefundId) {
    return "ignored" as const; // an earlier attempt's failure; a newer attempt is under way
  }
  if (
    !refund.razorpayRefundId &&
    refund.status === "PENDING" &&
    refund.failureReason === REFUND_SENDING
  ) {
    // A retry is talking to Razorpay right now, so we can't tell whether this is about the old
    // attempt or the new one. Throwing → the webhook job fails and is retried later.
    throw new Error("Refund is being sent right now; retry this webhook later");
  }
  const res = await db.refund.updateMany({
    where: {
      id: refund.id,
      status: "PENDING",
      OR: [{ razorpayRefundId: input.razorpayRefundId }, { razorpayRefundId: null }],
    },
    data: {
      status: "FAILED",
      razorpayRefundId: input.razorpayRefundId,
      failureReason: input.reason.slice(0, 300),
      rawPayload: input.raw,
    },
  });
  if (res.count > 0)
    logger.error("refund.failed", {
      refundId: refund.id,
      orderId: refund.orderId,
      reason: input.reason,
    });
  return res.count > 0 ? ("failed" as const) : ("ignored" as const);
}

/**
 * A cash-on-delivery refund the store paid by bank transfer / UPI. Only for COD payments
 * (Razorpay refunds are confirmed by Razorpay itself). Idempotent, like markRefundProcessed.
 */
export async function markManualRefundPaid(refundId: string, adminId: string, reference: string) {
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    include: { payment: { select: { provider: true } } },
  });
  if (!refund) return "unknown" as const;
  if (refund.payment.provider !== "COD") return "not_cod" as const;
  logger.info("refund.manual_paid", { refundId, adminId });
  return markRefundProcessed({
    razorpayRefundId: `manual_${refund.id}`,
    refundRef: refund.id,
    raw: { manual: true, adminId, reference: reference.slice(0, 120) },
  });
}

/** Admin "Retry refund": FAILED refunds, or PENDING ones that never reached Razorpay (stuck). */
export async function retryRefund(refundId: string, adminId: string) {
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    select: { status: true, razorpayRefundId: true, updatedAt: true },
  });
  if (!refund || !canRetryRefund(refund)) {
    logger.warn("refund.retry_not_allowed", { refundId, adminId, status: refund?.status });
    return "skipped" as const;
  }
  logger.info("refund.retry", { refundId, adminId });
  return issueRefund(refundId);
}

/**
 * Cron sweep: Razorpay refunds created but never sent (crash between the database commit and
 * the Razorpay call) and untouched for STUCK_REFUND_MS. FAILED refunds are left to the admin;
 * cash-on-delivery refunds are paid by hand.
 */
export async function sendStuckRefunds(now = new Date(), limit = 20) {
  const stuck = await db.refund.findMany({
    where: {
      status: "PENDING",
      razorpayRefundId: null,
      updatedAt: { lt: new Date(now.getTime() - STUCK_REFUND_MS) },
      payment: { provider: "RAZORPAY" },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const outcomes: Record<string, number> = {};
  for (const r of stuck) {
    const outcome = await issueRefund(r.id);
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  if (stuck.length > 0) logger.info("refund.stuck_swept", { found: stuck.length, ...outcomes });
  return { found: stuck.length, outcomes };
}
