import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 19 "done when": checkout doesn't depend on email/PDF/Shiprocket, a forced failure retries
 * and then shows as DEAD, webhooks only save + queue. Real handlers, real PostgreSQL.
 */

process.env.RESEND_API_KEY = "re_test_key_for_jobs_flow";
process.env.EMAIL_FROM = "Store <orders@example.com>";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

/** The email provider: slow (2 s) and failing unless told otherwise. */
const mail = vi.hoisted(() => ({ ok: false, delayMs: 2000, calls: 0, sent: [] as string[] }));
vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
  if (String(url).startsWith("https://api.resend.com")) {
    mail.calls++;
    await new Promise((r) => setTimeout(r, mail.delayMs));
    if (!mail.ok) return new Response("provider down", { status: 503 });
    mail.sent.push(JSON.parse(init?.body ?? "{}").subject);
    return new Response("{}", { status: 200 });
  }
  return new Response("{}", { status: 500 });
});

const { db } = await import("@/lib/db");
const jobs = await import("@/services/jobs.service");
const { recordWebhook } = await import("@/services/webhook.service");
const { markOrderPaid } = await import("@/services/order.service");

const RUN = `jf${Date.now().toString(36)}`;
let categoryId = "";
let userId = "";

async function pendingOrder(priceInPaise = 1_500_00) {
  const n = Math.random().toString(36).slice(2, 8);
  const p = await db.product.create({
    data: {
      name: `${RUN} ${n}`,
      slug: `${RUN}-${n}`,
      description: "x",
      priceInPaise,
      stock: 2,
      images: [],
      categoryId,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 1000,
      variants: {
        create: {
          sku: `${RUN}-${n}`.toUpperCase(),
          priceInPaise,
          stock: 2,
          netWeightMg: 1000,
          images: [],
        },
      },
    },
    include: { variants: true },
  });
  const order = await db.order.create({
    data: {
      userId,
      status: "PENDING",
      subtotalInPaise: priceInPaise,
      totalInPaise: priceInPaise,
      addressSnapshot: {
        fullName: "A",
        phone: "9876543210",
        line1: "x",
        city: "y",
        state: "Telangana",
        pincode: "500001",
      },
      reservationState: "ACTIVE",
      reservedUntil: new Date(Date.now() + 600_000),
      items: {
        create: {
          productId: p.id,
          variantId: p.variants[0]!.id,
          productName: p.name,
          productSlug: p.slug,
          priceInPaise,
          quantity: 1,
          lineTotalInPaise: priceInPaise,
          productSnapshot: {},
        },
      },
      payments: { create: { providerOrderId: `order_${RUN}${n}`, amountInPaise: priceInPaise } },
    },
  });
  await db.productVariant.update({
    where: { id: p.variants[0]!.id },
    data: { reservedStock: 1 },
  });
  return { orderId: order.id, rzpOrderId: `order_${RUN}${n}`, priceInPaise };
}

const jobsFor = (orderId: string) =>
  db.job.findMany({
    where: { payload: { path: ["orderId"], equals: orderId } },
    orderBy: { type: "asc" },
  });

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com`, name: "Flow Buyer" } })).id;
});
beforeEach(async () => {
  mail.ok = false;
  mail.delayMs = 2000;
  mail.sent.length = 0;
  await db.job.deleteMany({});
});
afterAll(async () => {
  await db.job.deleteMany({});
  await db.invoice.deleteMany({ where: { order: { userId } } });
  await db.payment.deleteMany({ where: { order: { userId } } });
  await db.order.deleteMany({ where: { userId } });
  await db.webhookEvent.deleteMany({ where: { eventId: { startsWith: RUN } } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("payment never waits for email or the invoice", () => {
  it("paying takes well under the email provider's 2 s and succeeds while email is down", async () => {
    const o = await pendingOrder();
    const callsBefore = mail.calls;
    const result = await markOrderPaid({
      razorpayOrderId: o.rzpOrderId,
      razorpayPaymentId: `pay_${RUN}a1`,
      amountInPaise: o.priceInPaise,
      rawPayload: {},
      source: "callback",
    });
    expect(result.outcome).toBe("paid");
    // Payment never touched the (slow, failing) email provider: it only queued the email.
    expect(mail.calls - callsBefore).toBe(0);
    // Both follow-ups were queued in the payment transaction.
    expect((await jobsFor(o.orderId)).map((j) => j.type)).toEqual([
      "email.order",
      "invoice.create",
    ]);

    // The worker: invoice works, email fails and is scheduled for a retry.
    await jobs.runDueJobs();
    expect(await db.invoice.count({ where: { orderId: o.orderId } })).toBe(1);
    const email = (await jobsFor(o.orderId)).find((j) => j.type === "email.order")!;
    expect(email).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(email.lastError).toMatch(/503/);

    // Provider back: the retry delivers it — once.
    mail.ok = true;
    mail.delayMs = 0;
    await db.job.update({ where: { id: email.id }, data: { runAt: new Date(Date.now() - 1000) } });
    await jobs.runDueJobs();
    await jobs.runDueJobs();
    expect(mail.sent.filter((s) => s.includes("confirmed"))).toHaveLength(1);
  });

  it("an email that keeps failing ends up DEAD (Admin → Jobs) — the order stays PAID", async () => {
    const o = await pendingOrder();
    await markOrderPaid({
      razorpayOrderId: o.rzpOrderId,
      razorpayPaymentId: `pay_${RUN}b1`,
      amountInPaise: o.priceInPaise,
      rawPayload: {},
      source: "callback",
    });
    mail.delayMs = 0;
    for (let i = 0; i < 6; i++) {
      await db.job.updateMany({
        where: { status: "PENDING" },
        data: { runAt: new Date(Date.now() - 1000) },
      });
      await jobs.runDueJobs();
    }
    const email = (await jobsFor(o.orderId)).find((j) => j.type === "email.order")!;
    expect(email).toMatchObject({ status: "DEAD", attempts: 6 });
    expect((await jobs.jobOverview()).dead.map((d) => d.id)).toContain(email.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe("PAID");

    mail.ok = true;
    expect(await jobs.retryDeadJob(email.id)).toBe(true);
    await jobs.runDueJobs();
    expect((await db.job.findUniqueOrThrow({ where: { id: email.id } })).status).toBe("DONE");
  });
});

describe("webhooks: save, queue, process in the background", () => {
  it("Razorpay payment.captured delivered twice → order paid once, one invoice, one email", async () => {
    mail.ok = true;
    mail.delayMs = 0;
    const o = await pendingOrder();
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_${RUN}c1`,
            order_id: o.rzpOrderId,
            amount: o.priceInPaise,
            status: "captured",
            method: "upi",
          },
        },
      },
    };
    const first = await recordWebhook({
      provider: "razorpay",
      eventId: `${RUN}-c1`,
      eventType: "payment.captured",
      payload,
    });
    const again = await recordWebhook({
      provider: "razorpay",
      eventId: `${RUN}-c1`,
      eventType: "payment.captured",
      payload,
    });
    expect([first.duplicate, again.duplicate]).toEqual([false, true]);
    // Nothing happened yet: the route only saved and queued.
    expect((await db.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe("PENDING");

    await jobs.runDueJobs();
    await jobs.runDueJobs();
    const order = await db.order.findUniqueOrThrow({
      where: { id: o.orderId },
      include: { payments: true },
    });
    expect(order.status).toBe("PAID");
    expect(order.payments[0]).toMatchObject({ status: "CAPTURED", method: "upi" });
    expect(await db.invoice.count({ where: { orderId: o.orderId } })).toBe(1);
    expect(mail.sent.filter((s) => s.includes("confirmed"))).toHaveLength(1);
    const saved = await db.webhookEvent.findFirstOrThrow({ where: { eventId: `${RUN}-c1` } });
    expect(saved.processedAt).not.toBeNull();
  });

  it("callback and webhook for the same payment → still one confirmation email", async () => {
    mail.ok = true;
    mail.delayMs = 0;
    const o = await pendingOrder();
    await markOrderPaid({
      razorpayOrderId: o.rzpOrderId,
      razorpayPaymentId: `pay_${RUN}d1`,
      amountInPaise: o.priceInPaise,
      rawPayload: {},
      source: "callback",
    });
    await recordWebhook({
      provider: "razorpay",
      eventId: `${RUN}-d1`,
      eventType: "payment.captured",
      payload: {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: `pay_${RUN}d1`,
              order_id: o.rzpOrderId,
              amount: o.priceInPaise,
              status: "captured",
            },
          },
        },
      },
    });
    await jobs.runDueJobs();
    await jobs.runDueJobs();
    expect(mail.sent.filter((s) => s.includes("confirmed"))).toHaveLength(1);
  });

  it("a courier event for a shipped order moves it on; a malformed saved event goes DEAD, not retried", async () => {
    mail.ok = true;
    mail.delayMs = 0;
    const o = await pendingOrder();
    await markOrderPaid({
      razorpayOrderId: o.rzpOrderId,
      razorpayPaymentId: `pay_${RUN}e1`,
      amountInPaise: o.priceInPaise,
      rawPayload: {},
      source: "callback",
    });
    const awb = `AWB${RUN}`;
    await db.shipment.create({ data: { orderId: o.orderId, awb, status: "AWB_ASSIGNED" } });
    await recordWebhook({
      provider: "shiprocket",
      eventId: `${RUN}-ship`,
      eventType: "IN TRANSIT",
      payload: {
        awb,
        current_status: "IN TRANSIT",
        current_status_id: 6,
        current_timestamp: "03 11 2026 10:00:00",
      },
    });
    await jobs.runDueJobs();
    expect((await db.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe("SHIPPED");

    await recordWebhook({
      provider: "shiprocket",
      eventId: `${RUN}-bad`,
      eventType: "x",
      payload: { nope: true },
    });
    await jobs.runDueJobs();
    const dead = await db.job.findFirstOrThrow({
      where: { type: "webhook.shiprocket", status: "DEAD" },
    });
    expect(dead.attempts).toBe(1);
    await db.shipmentEvent.deleteMany({ where: { shipment: { orderId: o.orderId } } });
    await db.shipment.deleteMany({ where: { orderId: o.orderId } });
  });

  it("a job with an unknown type or a broken payload goes DEAD at once", async () => {
    // Explicit runAt (like enqueue() does): a DB-default "now" can round up past the run's clock.
    await db.job.create({
      data: { type: "nonsense.job", payload: {}, runAt: new Date(Date.now() - 1000) },
    });
    await jobs.enqueue("invoice.create", { orderId: "x y z" });
    await jobs.runDueJobs();
    expect(await db.job.count({ where: { status: "DEAD", attempts: 1 } })).toBe(2);
  });
});
