import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const inventory = await import("@/services/inventory.service");
const { InsufficientStockError, convertReservation, releaseExpiredReservations, reserveLines } =
  inventory;

const RUN = `t${Date.now().toString(36)}`;
let categoryId = "";
let userId = "";

async function product(stock: number) {
  return db.product.create({
    data: {
      name: `${RUN} piece`,
      slug: `${RUN}-${Math.random().toString(36).slice(2, 8)}`,
      description: "test",
      priceInPaise: 100_00,
      stock,
      images: ["/x.svg"],
      categoryId,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 1000,
    },
  });
}

async function order(productId: string, quantity: number, reservedUntil: Date) {
  return db.order.create({
    data: {
      userId,
      status: "PENDING",
      subtotalInPaise: 100_00,
      totalInPaise: 100_00,
      addressSnapshot: {},
      reservationState: "ACTIVE",
      reservedUntil,
      items: {
        create: {
          productId,
          productName: "x",
          productSlug: "x",
          priceInPaise: 100_00,
          quantity,
          lineTotalInPaise: 100_00,
          productSnapshot: {},
        },
      },
    },
  });
}

const stockOf = async (id: string) =>
  db.product.findUniqueOrThrow({ where: { id }, select: { stock: true, reservedStock: true } });

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { userId } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("stock reservations (real database, real concurrency)", () => {
  it("two buyers, last piece, same moment → exactly one gets it", async () => {
    const p = await product(1);
    const attempt = () =>
      db.$transaction((tx) => reserveLines(tx, [{ productId: p.id, quantity: 1 }]));
    const results = await Promise.allSettled([attempt(), attempt()]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientStockError);
    expect(await stockOf(p.id)).toEqual({ stock: 1, reservedStock: 1 });
  });

  it("20 buyers racing for 3 pieces → exactly 3 holds, never oversold", async () => {
    const p = await product(3);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        db.$transaction((tx) => reserveLines(tx, [{ productId: p.id, quantity: 1 }])),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await stockOf(p.id)).toEqual({ stock: 3, reservedStock: 3 });
  });

  it("a multi-item order is all-or-nothing", async () => {
    const a = await product(5);
    const b = await product(0);
    await expect(
      db.$transaction((tx) =>
        reserveLines(tx, [
          { productId: a.id, quantity: 2 },
          { productId: b.id, quantity: 1 },
        ]),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await stockOf(a.id)).toEqual({ stock: 5, reservedStock: 0 }); // rolled back
  });

  it("paying converts the hold into a real stock decrease", async () => {
    const p = await product(2);
    const o = await order(p.id, 2, new Date(Date.now() + 60_000));
    await db.$transaction((tx) => reserveLines(tx, [{ productId: p.id, quantity: 2 }]));
    await db.$transaction((tx) => convertReservation(tx, o.id, "ACTIVE"));
    expect(await stockOf(p.id)).toEqual({ stock: 0, reservedStock: 0 });
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).reservationState).toBe(
      "CONVERTED",
    );
  });

  it("abandoned checkouts give stock back after 15 minutes — exactly once, even if the job runs in parallel", async () => {
    const p = await product(1);
    const o = await order(p.id, 1, new Date(Date.now() - 1000)); // already past its deadline
    await db.$transaction((tx) => reserveLines(tx, [{ productId: p.id, quantity: 1 }]));
    expect(await stockOf(p.id)).toEqual({ stock: 1, reservedStock: 1 });

    const runs = await Promise.all([
      releaseExpiredReservations(),
      releaseExpiredReservations(),
      releaseExpiredReservations(),
    ]);
    expect(runs.reduce((n, r) => n + r.released, 0)).toBe(1);
    expect(await stockOf(p.id)).toEqual({ stock: 1, reservedStock: 0 });
    const closed = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(closed).toMatchObject({ status: "CANCELLED", reservationState: "RELEASED" });
    expect(closed.expiredAt).not.toBeNull();
  });

  it("holds that haven't expired are left alone", async () => {
    const p = await product(1);
    await order(p.id, 1, new Date(Date.now() + 10 * 60_000));
    await db.$transaction((tx) => reserveLines(tx, [{ productId: p.id, quantity: 1 }]));
    await releaseExpiredReservations();
    expect(await stockOf(p.id)).toEqual({ stock: 1, reservedStock: 1 });
  });

  it("a late payment for an expired order succeeds only if the piece is still available", async () => {
    const p = await product(1);
    const o = await order(p.id, 1, new Date(Date.now() - 1000));
    await db.$transaction((tx) => reserveLines(tx, [{ productId: p.id, quantity: 1 }]));
    await releaseExpiredReservations();
    // someone else now holds the only piece
    await db.$transaction((tx) => reserveLines(tx, [{ productId: p.id, quantity: 1 }]));
    await expect(
      db.$transaction((tx) => convertReservation(tx, o.id, "RELEASED")),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await stockOf(p.id)).toEqual({ stock: 1, reservedStock: 1 });
  });
});
