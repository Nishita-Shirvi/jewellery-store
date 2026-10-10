import { describe, expect, it } from "vitest";
import {
  allocateDiscount,
  describeCoupon,
  evaluateCoupon,
  normalizeCode,
  type CouponRules,
} from "@/lib/coupons";

const now = new Date("2026-10-10T10:00:00Z");
const base: CouponRules = {
  code: "DIWALI10",
  type: "PERCENT",
  value: 10,
  minOrderInPaise: 5_000_00,
  maxDiscountInPaise: 2_000_00,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-31T23:59:59Z"),
  usageLimit: 100,
  perUserLimit: 1,
  isActive: true,
};
const fresh = { totalUses: 0, userUses: 0 };

describe("evaluateCoupon — every rule", () => {
  it("10% off with a cap", () => {
    expect(evaluateCoupon(base, 10_000_00, fresh, now)).toEqual({
      ok: true,
      discountInPaise: 1_000_00,
    });
    expect(evaluateCoupon(base, 68_500_00, fresh, now)).toEqual({
      ok: true,
      discountInPaise: 2_000_00,
    }); // capped
  });
  it("flat amount, never more than the subtotal", () => {
    const flat = {
      ...base,
      type: "FLAT" as const,
      value: 500_00,
      minOrderInPaise: 0,
      maxDiscountInPaise: null,
    };
    expect(evaluateCoupon(flat, 1_950_00, fresh, now)).toEqual({
      ok: true,
      discountInPaise: 500_00,
    });
    expect(evaluateCoupon({ ...flat, value: 5_000_00 }, 1_950_00, fresh, now)).toEqual({
      ok: true,
      discountInPaise: 1_950_00,
    });
  });
  it.each([
    ["unknown code", null, 10_000_00, fresh, /isn't valid/],
    ["inactive", { ...base, isActive: false }, 10_000_00, fresh, /isn't valid/],
    [
      "not started",
      { ...base, startsAt: new Date("2026-11-01T00:00:00Z") },
      10_000_00,
      fresh,
      /isn't active yet/,
    ],
    ["expired", { ...base, endsAt: new Date("2026-10-09T00:00:00Z") }, 10_000_00, fresh, /expired/],
    ["fully used", base, 10_000_00, { totalUses: 100, userUses: 0 }, /fully used/],
    ["per-user limit", base, 10_000_00, { totalUses: 5, userUses: 1 }, /already used/],
    ["below minimum", base, 4_000_00, fresh, /Add ₹1,000 more.*minimum order ₹5,000/],
  ])("rejects: %s", (_n, coupon, subtotal, usage, msg) => {
    const r = evaluateCoupon(coupon as CouponRules | null, subtotal, usage, now);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(msg);
  });
  it("unlimited coupons ignore usage counts", () => {
    expect(
      evaluateCoupon(
        { ...base, usageLimit: null, perUserLimit: null },
        10_000_00,
        { totalUses: 9999, userUses: 50 },
        now,
      ).ok,
    ).toBe(true);
  });
  it("normalises codes", () => expect(normalizeCode(" diwali 10 ")).toBe("DIWALI10"));
  it("describes coupons", () =>
    expect(describeCoupon(base)).toBe("10% off (up to ₹2,000) on orders over ₹5,000"));
});

describe("allocateDiscount", () => {
  it("splits in proportion and adds up exactly", () => {
    const shares = allocateDiscount([68_500_00, 1_950_00, 2_200_00], 2_000_00);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(2_000_00);
    expect(shares[0]!).toBeGreaterThan(shares[1]!);
  });
  it("handles awkward remainders", () => {
    const shares = allocateDiscount([1, 1, 1], 2);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(2);
    expect(allocateDiscount([100, 200], 0)).toEqual([0, 0]);
  });
});
