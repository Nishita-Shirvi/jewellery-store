import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 18 — cash on delivery against a real PostgreSQL database.
 * Focus on what can go wrong with money and stock: codes reused or guessed, double clicks,
 * two buyers for the last piece, cancellations and refused parcels restocking twice (or never),
 * cash recorded twice, refunds sent to Razorpay for cash that Razorpay never saw.
 */

// Settings for this file (read once when config/env load): ₹49 COD fee, SMS through a stand-in.
process.env.COD_FEE_RUPEES = "49";
process.env.COD_MAX_ORDER_RUPEES = "10000";
process.env.COD_MAX_REFUSALS = "2";
process.env.MSG91_AUTH_KEY = "test-msg91-auth-key";
process.env.MSG91_OTP_TEMPLATE_ID = "test-otp-template";
process.env.MSG91_API_BASE = "http://sms.test";
delete process.env.RESEND_API_KEY;
delete process.env.SHIPROCKET_EMAIL;
delete process.env.SHIPROCKET_PASSWORD;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

/** Every outgoing HTTP call. SMS bodies are kept; anything else (e.g. Razorpay) is recorded too. */
const sent = vi.hoisted(() => ({
  sms: [] as { mobile: string; code: string }[],
  other: [] as string[],
}));
vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
  if (String(url).startsWith("http://sms.test/api/v5/flow")) {
    const body = JSON.parse(init?.body ?? "{}");
    for (const r of body.recipients) sent.sms.push({ mobile: r.mobiles, code: r.otp });
    return new Response(JSON.stringify({ type: "success" }), { status: 200 });
  }
  sent.other.push(String(url));
  return new Response("{}", { status: 500 });
});

const { db } = await import("@/lib/db");
const cart = await import("@/services/cart.service");
const orders = await import("@/services/order.service");
const { markCashReceived } = await import("@/services/cod.service");
const { applyTrackingUpdate } = await import("@/services/shipment.service");
const { cancelPaidOrder, approveReturn } = await import("@/services/return.service");
const { markManualRefundPaid } = await import("@/services/refund.service");
const { updateOrderStatus } = await import("@/services/admin/order-admin.service");
const { salesReport } = await import("@/services/report.service");
const { MAX_ATTEMPTS } = await import("@/services/otp.service");
const { runDueJobs } = await import("@/services/jobs.service");

const RUN = `cod${Date.now().toString(36)}`;
let categoryId = "";
let seq = 0;
const userIds: string[] = [];

async function product(stock: number, priceInPaise = 1_000_00) {
  const n = ++seq;
  const p = await db.product.create({
    data: {
      name: `${RUN} piece ${n}`,
      slug: `${RUN}-p${n}`,
      description: "test",
      priceInPaise,
      stock,
      images: ["/x.svg"],
      categoryId,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 5000,
      variants: {
        create: {
          sku: `${RUN}-P${n}`.toUpperCase(),
          priceInPaise,
          stock,
          netWeightMg: 5000,
          images: [],
        },
      },
    },
    include: { variants: true },
  });
  return { id: p.id, variantId: p.variants[0]!.id };
}

/** A customer with an address and the given product in their cart. */
async function buyer(p: { id: string; variantId: string }, quantity = 1, phone = "9876543210") {
  const n = ++seq;
  const user = await db.user.create({
    data: { email: `${RUN}-${n}@example.com`, name: `Buyer ${n}` },
  });
  userIds.push(user.id);
  const address = await db.address.create({
    data: {
      userId: user.id,
      fullName: `Buyer ${n}`,
      phone,
      line1: "1 Test Road",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500001",
    },
  });
  const added = await cart.addItem(user.id, p.id, quantity, p.variantId);
  expect(added.ok).toBe(true);
  return { user: { id: user.id, email: user.email, name: user.name }, addressId: address.id };
}

const key = () => crypto.randomUUID();
const lastCode = () => sent.sms.at(-1)!.code;
const variantStock = (id: string) =>
  db.productVariant.findUniqueOrThrow({
    where: { id },
    select: { stock: true, reservedStock: true },
  });

/** Sends a code and places the COD order with it. */
async function placeCod(b: Awaited<ReturnType<typeof buyer>>, checkoutKey = key()) {
  const otp = await orders.sendCodOtp(b.user, { addressId: b.addressId });
  if (!otp.ok) throw new Error(otp.error);
  return orders.placeCodOrder(b.user, {
    addressId: b.addressId,
    checkoutKey,
    challengeId: otp.challengeId,
    code: lastCode(),
  });
}

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
});
beforeEach(() => {
  sent.sms.length = 0;
  sent.other.length = 0;
});
afterAll(async () => {
  const where = { order: { userId: { in: userIds } } };
  await db.refund.deleteMany({ where });
  await db.returnItem.deleteMany({ where: { returnRequest: where } });
  await db.returnRequest.deleteMany({ where });
  await db.payment.deleteMany({ where });
  await db.invoice.deleteMany({ where });
  await db.shipmentEvent.deleteMany({ where: { shipment: where } });
  await db.shipment.deleteMany({ where });
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

describe("placing a COD order", () => {
  it("happy path: CONFIRMED, stock taken for good, ₹49 fee in total and invoice, cart cleared", async () => {
    const p = await product(3, 1_000_00);
    const b = await buyer(p, 2);
    const quote = await orders.quoteCod(b.user, { addressId: b.addressId });
    expect(quote).toMatchObject({ ok: true, feeInPaise: 49_00, totalInPaise: 2_000_00 + 49_00 });

    const res = await placeCod(b);
    expect(res.ok).toBe(true);
    await runDueJobs(); // invoice + email are background jobs since Phase 19
    expect(sent.sms[0]).toMatchObject({ mobile: "919876543210" });
    expect(sent.other).toEqual([]); // no Razorpay call for COD
    const order = await db.order.findUniqueOrThrow({
      where: { id: res.ok ? res.orderId : "" },
      include: { invoice: true, payments: true },
    });
    expect(order).toMatchObject({
      status: "CONFIRMED",
      paymentMethod: "COD",
      codFeeInPaise: 49_00,
      totalInPaise: 2_049_00,
      reservationState: "CONVERTED",
      paidAt: null,
    });
    expect(order.payments).toEqual([]); // no money yet
    expect(await variantStock(p.variantId)).toEqual({ stock: 1, reservedStock: 0 });
    expect((await cart.getCartView(b.user.id)).items).toEqual([]);
    const snap = order.invoice!.snapshot as {
      paymentMode: string;
      lines: { name: string; totalInPaise: number }[];
      totals: { totalInPaise: number };
    };
    expect(snap.paymentMode).toBe("Cash on delivery");
    expect(snap.lines.find((l) => l.name === "Cash on delivery charges")?.totalInPaise).toBe(49_00);
    expect(snap.totals.totalInPaise).toBe(order.totalInPaise);
  });

  it("a wrong code is refused and counts; after the limit even the right code is refused", async () => {
    const p = await product(2);
    const b = await buyer(p);
    const otp = await orders.sendCodOtp(b.user, { addressId: b.addressId });
    if (!otp.ok) throw new Error(otp.error);
    const right = lastCode();
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const r = await orders.placeCodOrder(b.user, {
        addressId: b.addressId,
        checkoutKey: key(),
        challengeId: otp.challengeId,
        code: wrong,
      });
      expect(r.ok).toBe(false);
    }
    const r = await orders.placeCodOrder(b.user, {
      addressId: b.addressId,
      checkoutKey: key(),
      challengeId: otp.challengeId,
      code: right,
    });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/too many|expired/i) });
    expect(await variantStock(p.variantId)).toEqual({ stock: 2, reservedStock: 0 });
  });

  it("no code, an expired code, or someone else's code → no order", async () => {
    const p = await product(5);
    const a = await buyer(p);
    const b = await buyer(p, 1, "9123456780");
    expect(
      await orders.placeCodOrder(a.user, { addressId: a.addressId, checkoutKey: key() }),
    ).toMatchObject({ ok: false });

    const otpB = await orders.sendCodOtp(b.user, { addressId: b.addressId });
    if (!otpB.ok) throw new Error(otpB.error);
    expect(
      await orders.placeCodOrder(a.user, {
        addressId: a.addressId,
        checkoutKey: key(),
        challengeId: otpB.challengeId,
        code: lastCode(),
      }),
    ).toMatchObject({ ok: false });

    const otpA = await orders.sendCodOtp(a.user, { addressId: a.addressId });
    if (!otpA.ok) throw new Error(otpA.error);
    await db.otpChallenge.update({
      where: { id: otpA.challengeId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      await orders.placeCodOrder(a.user, {
        addressId: a.addressId,
        checkoutKey: key(),
        challengeId: otpA.challengeId,
        code: lastCode(),
      }),
    ).toMatchObject({ ok: false });
    expect(await db.order.count({ where: { userId: { in: [a.user.id, b.user.id] } } })).toBe(0);
  });

  it("the stored code is a hash, never the code itself", async () => {
    const p = await product(1);
    const b = await buyer(p);
    const otp = await orders.sendCodOtp(b.user, { addressId: b.addressId });
    if (!otp.ok) throw new Error(otp.error);
    const row = await db.otpChallenge.findUniqueOrThrow({ where: { id: otp.challengeId } });
    expect(row.codeHash).not.toContain(lastCode());
    expect(row.codeHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("at most 3 codes per 10 minutes", async () => {
    const p = await product(1);
    const b = await buyer(p);
    for (let i = 0; i < 3; i++)
      expect((await orders.sendCodOtp(b.user, { addressId: b.addressId })).ok).toBe(true);
    expect(await orders.sendCodOtp(b.user, { addressId: b.addressId })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Too many/),
    });
  });

  it("double click (same checkout key, at the same moment) → one order", async () => {
    const p = await product(5);
    const b = await buyer(p);
    const otp = await orders.sendCodOtp(b.user, { addressId: b.addressId });
    if (!otp.ok) throw new Error(otp.error);
    const input = {
      addressId: b.addressId,
      checkoutKey: key(),
      challengeId: otp.challengeId,
      code: lastCode(),
    };
    const [r1, r2] = await Promise.all([
      orders.placeCodOrder(b.user, input),
      orders.placeCodOrder(b.user, input),
    ]);
    const ids = [r1, r2].filter((r) => r.ok).map((r) => (r.ok ? r.orderId : ""));
    expect(new Set(ids).size).toBe(1);
    expect(await db.order.count({ where: { userId: b.user.id } })).toBe(1);
    expect(await variantStock(p.variantId)).toEqual({ stock: 4, reservedStock: 0 });
  });

  it("one code can't place two orders (different checkout keys, same moment)", async () => {
    const p = await product(5);
    const b = await buyer(p);
    const otp = await orders.sendCodOtp(b.user, { addressId: b.addressId });
    if (!otp.ok) throw new Error(otp.error);
    const code = lastCode();
    const results = await Promise.all(
      [key(), key()].map((checkoutKey) =>
        orders.placeCodOrder(b.user, {
          addressId: b.addressId,
          checkoutKey,
          challengeId: otp.challengeId,
          code,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.order.count({ where: { userId: b.user.id } })).toBe(1);
    expect(await variantStock(p.variantId)).toEqual({ stock: 4, reservedStock: 0 });
  });

  it("two COD buyers, last piece → one order, never oversold", async () => {
    const p = await product(1);
    const a = await buyer(p);
    const b = await buyer(p, 1, "9123456780");
    const [otpA, otpB] = [
      await orders.sendCodOtp(a.user, { addressId: a.addressId }),
      await orders.sendCodOtp(b.user, { addressId: b.addressId }),
    ];
    if (!otpA.ok || !otpB.ok) throw new Error("otp");
    const codeOf = (mobile: string) => sent.sms.filter((s) => s.mobile === mobile).at(-1)!.code;
    const results = await Promise.all([
      orders.placeCodOrder(a.user, {
        addressId: a.addressId,
        checkoutKey: key(),
        challengeId: otpA.challengeId,
        code: codeOf("919876543210"),
      }),
      orders.placeCodOrder(b.user, {
        addressId: b.addressId,
        checkoutKey: key(),
        challengeId: otpB.challengeId,
        code: codeOf("919123456780"),
      }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await variantStock(p.variantId)).toEqual({ stock: 0, reservedStock: 0 });
  });

  it("over the ₹10,000 limit, or after 2 refused parcels → COD refused with a reason", async () => {
    const big = await product(1, 10_000_00); // ₹10,000 + ₹49 fee > limit
    const b = await buyer(big);
    expect(await orders.quoteCod(b.user, { addressId: b.addressId })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/up to/),
    });
    expect((await orders.sendCodOtp(b.user, { addressId: b.addressId })).ok).toBe(false);
    expect(sent.sms).toHaveLength(0); // no SMS spent on an order that can't be COD

    const p = await product(1);
    const c = await buyer(p);
    await db.user.update({ where: { id: c.user.id }, data: { codRefusals: 2 } });
    expect(await orders.quoteCod(c.user, { addressId: c.addressId })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/refused/),
    });
  });

  it("an address with a bad mobile number can't use COD", async () => {
    const p = await product(1);
    const b = await buyer(p, 1, "12345");
    expect(await orders.quoteCod(b.user, { addressId: b.addressId })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/mobile/),
    });
  });
});

describe("after the order", () => {
  it("customer cancels before shipping → stock back once, nothing refunded", async () => {
    const p = await product(2);
    const b = await buyer(p);
    const res = await placeCod(b);
    if (!res.ok) throw new Error(res.error);
    expect(await variantStock(p.variantId)).toEqual({ stock: 1, reservedStock: 0 });
    const cancel = () =>
      cancelPaidOrder({
        orderId: res.orderId,
        by: "customer",
        actorId: b.user.id,
        userId: b.user.id,
      });
    const outcomes = await Promise.allSettled([cancel(), cancel()]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await variantStock(p.variantId)).toEqual({ stock: 2, reservedStock: 0 });
    expect(await db.refund.count({ where: { orderId: res.orderId } })).toBe(0);
    expect(sent.other).toEqual([]);
    expect((await db.order.findUniqueOrThrow({ where: { id: res.orderId } })).status).toBe(
      "CANCELLED",
    );
  });

  it("admin cancels a COD order → stock goes back (was missed by the generic cancel path)", async () => {
    const p = await product(2);
    const b = await buyer(p);
    const res = await placeCod(b);
    if (!res.ok) throw new Error(res.error);
    await updateOrderStatus(res.orderId, "CANCELLED", "admin");
    expect(await variantStock(p.variantId)).toEqual({ stock: 2, reservedStock: 0 });
  });

  it("refused parcel (RTO) → cancelled, restocked and counted ONCE even if the webhook repeats", async () => {
    const p = await product(2);
    const b = await buyer(p);
    const res = await placeCod(b);
    if (!res.ok) throw new Error(res.error);
    const awb = `AWB${RUN}${seq}`;
    await db.shipment.create({
      data: { orderId: res.orderId, awb, status: "AWB_ASSIGNED" },
    });
    const update = (statusId: number, label: string, minutes: number) =>
      applyTrackingUpdate({
        awb,
        statusId,
        statusLabel: label,
        occurredAt: new Date(Date.now() + minutes * 60_000),
        scans: [],
        raw: {},
      });
    await update(6, "SHIPPED", 0);
    expect((await db.order.findUniqueOrThrow({ where: { id: res.orderId } })).status).toBe(
      "SHIPPED",
    );
    await Promise.all([update(10, "RTO DELIVERED", 5), update(10, "RTO DELIVERED", 5)]);
    await update(9, "RTO INITIATED", 6);
    const order = await db.order.findUniqueOrThrow({ where: { id: res.orderId } });
    expect(order.status).toBe("CANCELLED");
    expect(order.rtoAt).not.toBeNull();
    expect(await variantStock(p.variantId)).toEqual({ stock: 2, reservedStock: 0 });
    expect((await db.user.findUniqueOrThrow({ where: { id: b.user.id } })).codRefusals).toBe(1);
  });

  it("delivered → cash recorded once (even two admins at once) → counts as COD revenue", async () => {
    const p = await product(1, 1_500_00);
    const b = await buyer(p);
    const res = await placeCod(b);
    if (!res.ok) throw new Error(res.error);
    // Not delivered yet: recording cash is refused.
    expect((await markCashReceived([res.orderId], "admin")).recorded).toBe(0);
    await updateOrderStatus(res.orderId, "SHIPPED", "admin");
    await updateOrderStatus(res.orderId, "DELIVERED", "admin");
    const runs = await Promise.all([
      markCashReceived([res.orderId], "admin-1"),
      markCashReceived([res.orderId], "admin-2"),
    ]);
    expect(runs.reduce((n, r) => n + r.recorded, 0)).toBe(1);
    const payments = await db.payment.findMany({ where: { orderId: res.orderId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: "COD",
      status: "CAPTURED",
      amountInPaise: 1_549_00,
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: res.orderId } });
    expect(order.paidAt).not.toBeNull();
    const report = await salesReport(1);
    expect(
      report.paymentMethods.find((m) => m.method === "cod")?.amountInPaise,
    ).toBeGreaterThanOrEqual(1_549_00);
  });

  it("returns: refused until cash is recorded; then refunded by hand, never through Razorpay", async () => {
    const p = await product(2, 1_000_00);
    const b = await buyer(p);
    const res = await placeCod(b);
    if (!res.ok) throw new Error(res.error);
    await updateOrderStatus(res.orderId, "SHIPPED", "admin");
    await updateOrderStatus(res.orderId, "DELIVERED", "admin");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: res.orderId } });
    await db.order.update({ where: { id: res.orderId }, data: { status: "RETURN_REQUESTED" } });
    const ret = await db.returnRequest.create({
      data: {
        orderId: res.orderId,
        userId: b.user.id,
        reason: "DAMAGED",
        items: { create: { orderItemId: item.id, quantity: 1 } },
      },
    });
    await expect(approveReturn(ret.id, "admin", { restock: true })).rejects.toThrow(/cash/i);

    await markCashReceived([res.orderId], "admin");
    await approveReturn(ret.id, "admin", { restock: true });
    const refund = await db.refund.findFirstOrThrow({ where: { orderId: res.orderId } });
    expect(refund.status).toBe("PENDING");
    expect(refund.failureReason).toMatch(/bank transfer or UPI/);
    expect(sent.other).toEqual([]); // Razorpay never called
    expect(await variantStock(p.variantId)).toEqual({ stock: 2, reservedStock: 0 }); // restocked

    expect(await markManualRefundPaid(refund.id, "admin", "UTR123")).toBe("processed");
    expect(await markManualRefundPaid(refund.id, "admin", "UTR123")).toBe("already");
    const after = await db.order.findUniqueOrThrow({ where: { id: res.orderId } });
    expect(after.refundedInPaise).toBe(refund.amountInPaise);
  });
});
