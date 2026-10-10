import type { CouponType } from "@prisma/client";

/** Pure coupon rules (unit-tested). Money in paise. The discount applies to items, never shipping. */

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export interface CouponRules {
  code: string;
  type: CouponType;
  value: number;
  minOrderInPaise: number;
  maxDiscountInPaise: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  isActive: boolean;
}

export interface CouponUsage {
  /** Paid uses + unpaid orders currently holding the coupon. */
  totalUses: number;
  userUses: number;
}

export type CouponResult = { ok: true; discountInPaise: number } | { ok: false; error: string };

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function evaluateCoupon(
  coupon: CouponRules | null,
  subtotalInPaise: number,
  usage: CouponUsage,
  now = new Date(),
): CouponResult {
  if (!coupon || !coupon.isActive) return { ok: false, error: "This coupon code isn't valid." };
  if (coupon.startsAt && now < coupon.startsAt)
    return { ok: false, error: "This coupon isn't active yet." };
  if (coupon.endsAt && now > coupon.endsAt) return { ok: false, error: "This coupon has expired." };
  if (coupon.usageLimit !== null && usage.totalUses >= coupon.usageLimit)
    return { ok: false, error: "This coupon has been fully used." };
  if (coupon.perUserLimit !== null && usage.userUses >= coupon.perUserLimit) {
    return {
      ok: false,
      error:
        coupon.perUserLimit === 1
          ? "You've already used this coupon."
          : `You've already used this coupon ${coupon.perUserLimit} times.`,
    };
  }
  if (subtotalInPaise < coupon.minOrderInPaise) {
    return {
      ok: false,
      error: `Add ${rupees(coupon.minOrderInPaise - subtotalInPaise)} more to use this coupon (minimum order ${rupees(coupon.minOrderInPaise)}).`,
    };
  }

  let discount =
    coupon.type === "PERCENT" ? Math.floor((subtotalInPaise * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscountInPaise !== null) discount = Math.min(discount, coupon.maxDiscountInPaise);
  discount = Math.min(discount, subtotalInPaise);
  if (discount <= 0) return { ok: false, error: "This coupon doesn't apply to your cart." };
  return { ok: true, discountInPaise: discount };
}

/**
 * Splits an order discount across its lines in proportion to their value, so each line's GST
 * is worked out on what the customer really paid. Shares always add up to the exact discount.
 */
export function allocateDiscount(lineTotals: number[], discountInPaise: number): number[] {
  const total = lineTotals.reduce((a, b) => a + b, 0);
  if (discountInPaise <= 0 || total <= 0) return lineTotals.map(() => 0);
  const exact = lineTotals.map((t) => (t * discountInPaise) / total);
  const shares = exact.map(Math.floor);
  let left = discountInPaise - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => [e - Math.floor(e), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    shares[i]! += 1;
    left -= 1;
  }
  return shares;
}

export function describeCoupon(c: {
  type: CouponType;
  value: number;
  maxDiscountInPaise: number | null;
  minOrderInPaise: number;
}): string {
  const what = c.type === "PERCENT" ? `${c.value}% off` : `${rupees(c.value)} off`;
  const cap =
    c.type === "PERCENT" && c.maxDiscountInPaise ? ` (up to ${rupees(c.maxDiscountInPaise)})` : "";
  const min = c.minOrderInPaise > 0 ? ` on orders over ${rupees(c.minOrderInPaise)}` : "";
  return `${what}${cap}${min}`;
}
