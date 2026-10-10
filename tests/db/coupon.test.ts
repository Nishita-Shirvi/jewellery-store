import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { db } = await import("@/lib/db");
const { redeemCouponInTx, CouponLimitReached } = await import("@/services/coupon.service");

const RUN = `cpn${Date.now().toString(36)}`;
const users: string[] = [];

async function order(userId: string, couponId: string) {
  return db.order.create({
    data: {
      userId,
      status: "PENDING",
      subtotalInPaise: 1000,
      totalInPaise: 900,
      discountInPaise: 100,
      couponId,
      addressSnapshot: {},
    },
  });
}

beforeAll(async () => {
  for (let i = 0; i < 10; i++)
    users.push((await db.user.create({ data: { email: `${RUN}-${i}@example.com` } })).id);
});
afterAll(async () => {
  await db.couponRedemption.deleteMany({ where: { userId: { in: users } } });
  await db.order.deleteMany({ where: { userId: { in: users } } });
  await db.coupon.deleteMany({ where: { code: { startsWith: RUN.toUpperCase() } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

describe("coupon limits under real concurrency", () => {
  it("usage limit 3, ten customers paying at the same moment → exactly 3 redemptions", async () => {
    const c = await db.coupon.create({
      data: {
        code: `${RUN.toUpperCase()}A`,
        type: "PERCENT",
        value: 10,
        usageLimit: 3,
        perUserLimit: 1,
      },
    });
    const orders = await Promise.all(users.map((u) => order(u, c.id)));
    const results = await Promise.allSettled(
      orders.map((o) => db.$transaction((tx) => redeemCouponInTx(tx, o))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => (r as PromiseRejectedResult).reason instanceof CouponLimitReached),
    ).toBe(true);
    expect((await db.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount).toBe(3);
    expect(await db.couponRedemption.count({ where: { couponId: c.id } })).toBe(3);
  });

  it("one customer, once-per-customer coupon, two payments at the same moment → only one counts", async () => {
    const c = await db.coupon.create({
      data: {
        code: `${RUN.toUpperCase()}B`,
        type: "FLAT",
        value: 100,
        usageLimit: null,
        perUserLimit: 1,
      },
    });
    const [a, b] = await Promise.all([order(users[0]!, c.id), order(users[0]!, c.id)]);
    const results = await Promise.allSettled(
      [a, b].map((o) => db.$transaction((tx) => redeemCouponInTx(tx, o))),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.couponRedemption.count({ where: { couponId: c.id } })).toBe(1);
    expect((await db.coupon.findUniqueOrThrow({ where: { id: c.id } })).usedCount).toBe(1); // failed one rolled back
  });
});
