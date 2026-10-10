import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { describeCoupon, evaluateCoupon, normalizeCode, type CouponResult } from "@/lib/coupons";

type Tx = Prisma.TransactionClient;

export class CouponLimitReached extends Error {
  constructor() {
    super("Coupon limit reached");
  }
}

export async function findCoupon(code: string) {
  const normalized = normalizeCode(code);
  if (!/^[A-Z0-9_-]{2,32}$/.test(normalized)) return null;
  return db.coupon.findUnique({ where: { code: normalized } });
}

/** Paid uses plus unpaid orders currently holding the coupon (so two carts can't both take the last use). */
async function usage(couponId: string, usedCount: number, userId: string, excludeOrderId?: string) {
  const holding = {
    couponId,
    status: { in: ["PENDING", "FAILED"] as ("PENDING" | "FAILED")[] },
    reservationState: "ACTIVE" as const,
    ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
  };
  const [pendingAll, pendingMine, paidMine] = await Promise.all([
    db.order.count({ where: holding }),
    db.order.count({ where: { ...holding, userId } }),
    db.couponRedemption.count({ where: { couponId, userId } }),
  ]);
  return { totalUses: usedCount + pendingAll, userUses: paidMine + pendingMine };
}

export async function checkCoupon(
  code: string,
  userId: string,
  subtotalInPaise: number,
): Promise<CouponResult & { couponId?: string; code?: string; description?: string }> {
  const coupon = await findCoupon(code);
  const result = evaluateCoupon(
    coupon,
    subtotalInPaise,
    coupon ? await usage(coupon.id, coupon.usedCount, userId) : { totalUses: 0, userUses: 0 },
  );
  return result.ok && coupon
    ? { ...result, couponId: coupon.id, code: coupon.code, description: describeCoupon(coupon) }
    : result;
}

/**
 * Inside the payment transaction: count the use. The conditional UPDATE locks the coupon row,
 * so concurrent payments queue up and the limit can't be exceeded. Throws CouponLimitReached.
 */
export async function redeemCouponInTx(
  tx: Tx,
  order: { id: string; userId: string; couponId: string | null; discountInPaise: number },
) {
  if (!order.couponId) return;
  const counted = await tx.$executeRaw`
    UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
     WHERE "id" = ${order.couponId} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
  if (counted === 0) throw new CouponLimitReached();
  const coupon = await tx.coupon.findUniqueOrThrow({
    where: { id: order.couponId },
    select: { perUserLimit: true },
  });
  if (coupon.perUserLimit !== null) {
    const mine = await tx.couponRedemption.count({
      where: { couponId: order.couponId, userId: order.userId },
    });
    if (mine >= coupon.perUserLimit) throw new CouponLimitReached();
  }
  await tx.couponRedemption.create({
    data: {
      couponId: order.couponId,
      userId: order.userId,
      orderId: order.id,
      discountInPaise: order.discountInPaise,
    },
  });
}
