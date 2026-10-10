import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { errorMessage, logger } from "@/lib/logger";
import {
  RazorpayError,
  createRazorpayRefund,
  listRazorpayRefunds,
  refundRefOf,
} from "@/lib/payments/razorpay";
import { statusAfterRefund } from "@/lib/returns";
import { sendOrderUpdateEmail } from "@/services/email.service";

type Tx = Prisma.TransactionClient;

/** Creates a PENDING refund row inside the caller's transaction (Razorpay is called afterwards). */
export async function createRefundRecord(
  tx: Tx,
  input: { orderId: string; amountInPaise: number; reason: string; returnRequestId?: string },
): Promise<string> {
  if (input.amountInPaise <= 0) throw new Error("Refund amount must be positive");
  const payment = await tx.payment.findFirst({
    where: { orderId: input.orderId, status: "CAPTURED", providerPaymentId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, amountInPaise: true },
  });
  if (!payment) throw new Error("No captured payment to refund");

  // Never refund more than was paid, across all refunds for this payment.
  const already = await tx.refund.aggregate({
    where: { paymentId: payment.id, status: { in: ["PENDING", "PROCESSED"] } },
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
 * Sends a PENDING/FAILED refund to Razorpay. Safe to call again: it first looks for a refund
 * Razorpay already made with our reference (in case the earlier response was lost).
 */
export async function issueRefund(
  refundId: string,
): Promise<"sent" | "processed" | "failed" | "skipped"> {
  const refund = await db.refund.findUnique({
    where: { id: refundId },
    include: { payment: { select: { providerPaymentId: true } } },
  });
  if (
    !refund ||
    refund.status === "PROCESSED" ||
    refund.razorpayRefundId ||
    !refund.payment.providerPaymentId
  )
    return "skipped";
  const paymentId = refund.payment.providerPaymentId;

  try {
    const existing = (await listRazorpayRefunds(paymentId)).find(
      (r) => refundRefOf(r) === refund.id,
    );
    const rzp =
      existing ?? (await createRazorpayRefund(paymentId, refund.amountInPaise, refund.id));
    await db.refund.update({
      where: { id: refund.id },
      data: {
        razorpayRefundId: rzp.id,
        status: "PENDING",
        failureReason: null,
        rawPayload: rzp as unknown as Prisma.InputJsonValue,
      },
    });
    logger.info("refund.sent", {
      refundId,
      razorpayRefundId: rzp.id,
      orderId: refund.orderId,
      amountInPaise: refund.amountInPaise,
    });
    if (rzp.status === "processed") {
      await markRefundProcessed({
        razorpayRefundId: rzp.id,
        refundRef: refund.id,
        raw: rzp as unknown as Prisma.InputJsonValue,
      });
      return "processed";
    }
    return "sent";
  } catch (error) {
    const message = error instanceof RazorpayError ? error.message : "Couldn't reach Razorpay";
    await db.refund.update({
      where: { id: refund.id },
      data: { status: "FAILED", failureReason: message.slice(0, 300) },
    });
    logger.error("refund.failed_to_send", {
      refundId,
      orderId: refund.orderId,
      error: errorMessage(error),
    });
    return "failed";
  }
}

async function findRefund(match: { razorpayRefundId?: string; refundRef?: string }) {
  if (match.razorpayRefundId) {
    const byId = await db.refund.findUnique({
      where: { razorpayRefundId: match.razorpayRefundId },
    });
    if (byId) return byId;
  }
  return match.refundRef ? db.refund.findUnique({ where: { id: match.refundRef } }) : null;
}

/**
 * refund.processed (webhook or immediate response). Idempotent: only the first call adds the
 * amount to the order and moves the order to REFUNDED (all back) or DELIVERED (partial return).
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

    const order = await tx.order.update({
      where: { id: refund.orderId },
      data: { refundedInPaise: { increment: refund.amountInPaise } },
      select: { id: true, totalInPaise: true, refundedInPaise: true },
    });
    const openRefunds = await tx.refund.count({
      where: { orderId: order.id, status: { in: ["PENDING", "FAILED"] } },
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
  const res = await db.refund.updateMany({
    where: { id: refund.id, status: "PENDING" },
    data: { status: "FAILED", failureReason: input.reason.slice(0, 300), rawPayload: input.raw },
  });
  if (res.count > 0)
    logger.error("refund.failed", {
      refundId: refund.id,
      orderId: refund.orderId,
      reason: input.reason,
    });
  return res.count > 0 ? ("failed" as const) : ("ignored" as const);
}

export async function retryRefund(refundId: string, adminId: string) {
  logger.info("refund.retry", { refundId, adminId });
  return issueRefund(refundId);
}
