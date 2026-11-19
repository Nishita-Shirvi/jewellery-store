import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RazorpayModule from "@/lib/payments/razorpay";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: () => {},
  revalidatePath: () => {},
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("@/services/email.service", () => ({
  sendOrderUpdateEmail: async () => {},
  sendOrderConfirmationEmail: async () => {},
}));
vi.mock("@/services/report.service", () => ({ countFunnel: async () => {} }));

/** In-memory Razorpay refunds API. */
type FakeRefund = {
  id: string;
  payment_id: string;
  amount: number;
  status: "pending" | "processed" | "failed";
  notes: { refundRef: string };
};
const rzp = vi.hoisted(() => ({
  refunds: [] as FakeRefund[],
  creates: 0,
  onCreate: null as null | ((r: FakeRefund) => Promise<void>),
  failCreate: false,
}));
vi.mock("@/lib/payments/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof RazorpayModule>()),
  listRazorpayRefunds: async (paymentId: string) =>
    rzp.refunds.filter((r) => r.payment_id === paymentId),
  createRazorpayRefund: async (paymentId: string, amount: number, refundRef: string) => {
    rzp.creates++;
    await new Promise((r) => setTimeout(r, 30)); // a slow network call widens race windows
    if (rzp.failCreate) throw new Error("socket hang up");
    const refund: FakeRefund = {
      id: `rfnd_${Math.random().toString(36).slice(2, 12)}`,
      payment_id: paymentId,
      amount,
      status: "pending",
      notes: { refundRef },
    };
    rzp.refunds.push(refund);
    if (rzp.onCreate) await rzp.onCreate(refund);
    return refund;
  },
}));

const { db } = await import("@/lib/db");
const { markOrderPaid } = await import("@/services/order.service");
const refunds = await import("@/services/refund.service");
const { convertReservation, reserveLines, InsufficientStockError } =
  await import("@/services/inventory.service");
const { cancelPaidOrder, ReturnError } = await import("@/services/return.service");

const RUN = `pr${Date.now().toString(36)}`;
let categoryId = "";
let userId = "";
const TOTAL = 50_000;

/** A product with one base variant (as every product has since Phase 17). */
async function product(stock: number) {
  const p = await db.product.create({
    data: {
      name: `${RUN} piece`,
      slug: `${RUN}-${Math.random().toString(36).slice(2, 8)}`,
      description: "test",
      priceInPaise: TOTAL,
      stock,
      images: ["/x.svg"],
      categoryId,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 1000,
      variants: {
        create: {
          sku: `SKU-${RUN}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
          priceInPaise: TOTAL,
          stock,
          netWeightMg: 1000,
          images: [],
        },
      },
    },
    include: { variants: true },
  });
  return { id: p.id, variantId: p.variants[0]!.id };
}

type Piece = Awaited<ReturnType<typeof product>>;
const hold = (p: Piece) =>
  db.$transaction((tx) =>
    reserveLines(tx, [{ productId: p.id, variantId: p.variantId, quantity: 1 }]),
  );

/** An order with one line and its Razorpay order (Payment row). */
async function order(
  p: Piece,
  data: Partial<{
    status: "PENDING" | "FAILED" | "CANCELLED" | "PAID";
    reservationState: "ACTIVE" | "RELEASED" | "CONVERTED" | "NONE";
    reservedUntil: Date | null;
    expiredAt: Date | null;
    paidWith: string;
  }> = {},
) {
  const rzpOrderId = `order_${RUN}${Math.random().toString(36).slice(2, 10)}`;
  const o = await db.order.create({
    data: {
      userId,
      status: data.status ?? "PENDING",
      subtotalInPaise: TOTAL,
      totalInPaise: TOTAL,
      addressSnapshot: { state: "Telangana" },
      reservationState: data.reservationState ?? "NONE",
      reservedUntil: data.reservedUntil ?? null,
      expiredAt: data.expiredAt ?? null,
      paidAt: data.paidWith ? new Date() : null,
      items: {
        create: {
          productId: p.id,
          variantId: p.variantId,
          productName: "x",
          productSlug: "x",
          priceInPaise: TOTAL,
          quantity: 1,
          lineTotalInPaise: TOTAL,
          productSnapshot: {},
        },
      },
      payments: {
        create: {
          providerOrderId: rzpOrderId,
          amountInPaise: TOTAL,
          status: data.paidWith ? "CAPTURED" : "CREATED",
          providerPaymentId: data.paidWith ?? null,
        },
      },
    },
  });
  return { ...o, rzpOrderId };
}

const pay = (rzpOrderId: string, paymentId: string) =>
  markOrderPaid({
    razorpayOrderId: rzpOrderId,
    razorpayPaymentId: paymentId,
    amountInPaise: TOTAL,
    rawPayload: {},
    source: "webhook",
  });

const pid = () => `pay_${RUN}${Math.random().toString(36).slice(2, 10)}`;

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
});

beforeEach(() => {
  rzp.creates = 0;
  rzp.onCreate = null;
  rzp.failCreate = false;
});

afterAll(async () => {
  const where = { order: { userId } };
  const orders = await db.order.findMany({ where: { userId }, select: { id: true } });
  for (const { id } of orders)
    await db.job.deleteMany({ where: { payload: { path: ["orderId"], equals: id } } });
  await db.refund.deleteMany({ where });
  await db.payment.deleteMany({ where });
  await db.shipment.deleteMany({ where });
  await db.invoice.deleteMany({ where });
  await db.order.deleteMany({ where: { userId } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("fix 1: a payment that can't pay the order is refunded, exactly once", () => {
  it("payment for an admin-cancelled order → recorded + refunded; redelivery doesn't refund twice", async () => {
    const p = await product(1);
    const o = await order(p, { status: "CANCELLED", reservationState: "RELEASED" });
    const payB = pid();

    const first = await pay(o.rzpOrderId, payB);
    expect(first).toEqual({ outcome: "extra_payment_refunded", orderId: o.id });
    const again = await Promise.all([pay(o.rzpOrderId, payB), pay(o.rzpOrderId, payB)]);
    expect(again.every((r) => r.outcome === "extra_payment_refunded")).toBe(true);

    const rows = await db.refund.findMany({ where: { orderId: o.id }, include: { payment: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountInPaise: TOTAL, status: "PENDING" });
    expect(rows[0]!.razorpayRefundId).toMatch(/^rfnd_/);
    expect(rows[0]!.payment.providerPaymentId).toBe(payB);
    expect(rzp.creates).toBe(1);
    // The order stays cancelled; its stock is untouched.
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
      status: "CANCELLED",
      refundedInPaise: 0,
    });
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(1);
  });

  it("never says 'refunding in full' for a recorded payment that has no refund", async () => {
    const p = await product(1);
    const o = await order(p, { status: "CANCELLED", reservationState: "RELEASED" });
    const payB = pid();
    // Damaged data: this payment id is already stored, but nothing refunds it.
    await db.payment.create({
      data: {
        orderId: o.id,
        providerOrderId: `extra:${payB}`,
        providerPaymentId: payB,
        status: "CAPTURED",
        amountInPaise: TOTAL,
      },
    });
    const result = await pay(o.rzpOrderId, payB);
    expect(result).toEqual({ outcome: "already_processed", orderId: o.id });
    expect(rzp.creates).toBe(0);
  });

  it("second payment for an order already PAID by another payment → refunded; order untouched", async () => {
    const p = await product(1);
    const payA = pid();
    const o = await order(p, { status: "PAID", reservationState: "CONVERTED", paidWith: payA });
    const payB = pid();

    expect((await pay(o.rzpOrderId, payA)).outcome).toBe("already_processed");
    expect(rzp.creates).toBe(0); // the payment that paid the order is never refunded

    expect((await pay(o.rzpOrderId, payB)).outcome).toBe("already_processed");
    await pay(o.rzpOrderId, payB);
    expect(rzp.creates).toBe(1);

    const refund = await db.refund.findFirstOrThrow({ where: { orderId: o.id } });
    await refunds.markRefundProcessed({ razorpayRefundId: refund.razorpayRefundId!, raw: {} });
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after).toMatchObject({ status: "PAID", refundedInPaise: 0 }); // still to be shipped
    const extra = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: payB } });
    expect(extra.status).toBe("REFUNDED");
    const main = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: payA } });
    expect(main.status).toBe("CAPTURED");
  });
});

describe("fix 2: sold out after payment", () => {
  it("order, payment and refund row are written together; Razorpay is called after", async () => {
    const p = await product(1);
    const o = await order(p, {
      status: "CANCELLED",
      reservationState: "RELEASED",
      expiredAt: new Date(),
    });
    // someone else holds the only piece now
    await hold(p);
    rzp.failCreate = true; // Razorpay down: the refund row must still exist

    const payB = pid();
    expect((await pay(o.rzpOrderId, payB)).outcome).toBe("sold_out");
    const after = await db.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { refunds: true, payments: true },
    });
    expect(after.status).toBe("REFUND_PENDING");
    expect(after.payments[0]).toMatchObject({ status: "CAPTURED", providerPaymentId: payB });
    expect(after.refunds).toHaveLength(1);
    expect(after.refunds[0]).toMatchObject({ amountInPaise: TOTAL, status: "FAILED" });

    // Redelivery (or the customer's callback): still "sold out", never "confirmed"; no second refund row.
    rzp.failCreate = false;
    expect((await pay(o.rzpOrderId, payB)).outcome).toBe("sold_out");
    expect(await db.refund.count({ where: { orderId: o.id } })).toBe(1);
  });
});

describe("fixes 3–6: refund retries", () => {
  async function failedRefund() {
    const p = await product(1);
    const payA = pid();
    const o = await order(p, { status: "PAID", reservationState: "CONVERTED", paidWith: payA });
    await cancelPaidOrder({ orderId: o.id, by: "admin", actorId: "admin" });
    const refund = await db.refund.findFirstOrThrow({ where: { orderId: o.id } });
    // The bank rejects it.
    rzp.refunds.find((r) => r.id === refund.razorpayRefundId)!.status = "failed";
    await refunds.markRefundFailed({
      razorpayRefundId: refund.razorpayRefundId!,
      refundRef: refund.id,
      reason: "Refund failed at the bank",
      raw: {},
    });
    return { order: o, refund: await db.refund.findUniqueOrThrow({ where: { id: refund.id } }) };
  }

  it("fix 3: a refund that failed at the bank can be retried, with a new reference", async () => {
    const { refund } = await failedRefund();
    expect(refund).toMatchObject({ status: "FAILED" });
    expect(refund.razorpayRefundId).toMatch(/^rfnd_/);
    rzp.creates = 0;

    expect(await refunds.retryRefund(refund.id, "admin")).toBe("sent");
    const retried = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(retried.status).toBe("PENDING");
    expect(retried.razorpayRefundId).not.toBe(refund.razorpayRefundId);
    expect(rzp.creates).toBe(1);
    const created = rzp.refunds.find((r) => r.id === retried.razorpayRefundId)!;
    expect(created.notes.refundRef).toBe(`${refund.id}:2`);

    // A late duplicate of the OLD failure doesn't touch the new attempt...
    expect(
      await refunds.markRefundFailed({
        razorpayRefundId: refund.razorpayRefundId!,
        refundRef: refund.id,
        reason: "late",
        raw: {},
      }),
    ).toBe("ignored");
    // ...and the webhook for the new attempt (reference "<id>:2") is matched to our row.
    expect(
      await refunds.markRefundProcessed({
        razorpayRefundId: "rfnd_unseen_by_id",
        refundRef: `${refund.id}:2`,
        raw: {},
      }),
    ).toBe("already"); // stored id differs → refused, logged for a human
    expect(
      await refunds.markRefundProcessed({
        razorpayRefundId: retried.razorpayRefundId!,
        refundRef: `${refund.id}:2`,
        raw: {},
      }),
    ).toBe("processed");
  });

  it("fix 4: concurrent retries call Razorpay once", async () => {
    const { refund } = await failedRefund();
    rzp.creates = 0;
    const outcomes = await Promise.all([
      refunds.issueRefund(refund.id),
      refunds.issueRefund(refund.id),
      refunds.issueRefund(refund.id),
      refunds.retryRefund(refund.id, "admin"),
    ]);
    expect(rzp.creates).toBe(1);
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(1);
  });

  it("fix 5: a fast refund.processed webhook is not overwritten by the API response", async () => {
    const { refund } = await failedRefund();
    rzp.onCreate = async (r) => {
      r.status = "processed";
      await refunds.markRefundProcessed({
        razorpayRefundId: r.id,
        refundRef: r.notes.refundRef,
        raw: {},
      });
      r.status = "pending"; // the API response we got back was still "pending"
    };
    await refunds.retryRefund(refund.id, "admin");
    const final = await db.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(final.status).toBe("PROCESSED");
    expect(final.processedAt).not.toBeNull();
  });

  it("fix 6: a PENDING refund that never reached Razorpay is swept after 10 minutes", async () => {
    const p = await product(1);
    const o = await order(p, { status: "PAID", reservationState: "CONVERTED", paidWith: pid() });
    const refundId = await db.$transaction((tx) =>
      refunds.createRefundRecord(tx, { orderId: o.id, amountInPaise: TOTAL, reason: "crash" }),
    );
    expect(await refunds.retryRefund(refundId, "admin")).toBe("skipped"); // too fresh
    await db.$executeRaw`UPDATE "Refund" SET "updatedAt" = NOW() - INTERVAL '11 minutes' WHERE "id" = ${refundId}`;
    rzp.creates = 0;
    const swept = await refunds.sendStuckRefunds();
    expect(swept.found).toBeGreaterThanOrEqual(1);
    expect(rzp.creates).toBeGreaterThanOrEqual(1);
    const after = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
    expect(after.razorpayRefundId).toMatch(/^rfnd_/);
  });
});

describe("fix 7: converting a hold uses the real (locked) reservation state", () => {
  it("a stale 'ACTIVE' never consumes another buyer's hold", async () => {
    const p = await product(1);
    // Our hold already expired and was released; another buyer now holds the only piece.
    const o = await order(p, { status: "PENDING", reservationState: "RELEASED" });
    await hold(p);
    await expect(db.$transaction((tx) => convertReservation(tx, o.id))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    expect(await db.product.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      stock: 1,
      reservedStock: 1,
    });
  });

  it("payment racing the expiry job: one piece, never oversold", async () => {
    const p = await product(1);
    const o = await order(p, {
      status: "PENDING",
      reservationState: "ACTIVE",
      reservedUntil: new Date(Date.now() - 1000),
    });
    await hold(p);
    const { releaseExpiredReservations } = await import("@/services/inventory.service");
    await Promise.all([pay(o.rzpOrderId, pid()), releaseExpiredReservations()]);
    const stock = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(stock.stock).toBeGreaterThanOrEqual(0);
    expect(stock.reservedStock).toBeGreaterThanOrEqual(0);
    expect(stock.stock + (await db.order.count({ where: { id: o.id, status: "PAID" } }))).toBe(1);
  });
});

describe("fix 8: no cancellation once a courier shipment exists", () => {
  it("admin and customer are blocked; the error tells the admin to cancel at the courier", async () => {
    const p = await product(1);
    const o = await order(p, { status: "PAID", reservationState: "CONVERTED", paidWith: pid() });
    await db.shipment.create({ data: { orderId: o.id, providerShipmentId: "SR123" } });
    await expect(cancelPaidOrder({ orderId: o.id, by: "admin", actorId: "admin" })).rejects.toThrow(
      /Cancel it in Shiprocket first/,
    );
    await expect(
      cancelPaidOrder({ orderId: o.id, by: "customer", actorId: userId, userId }),
    ).rejects.toBeInstanceOf(ReturnError);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PAID");
    expect(await db.refund.count({ where: { orderId: o.id } })).toBe(0);
  });
});
