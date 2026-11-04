import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 26 — monitoring against a real PostgreSQL database: each alert check, the alert life
 * cycle (start → one email even with simultaneous checks → reminder → resolved), delivery, and
 * the deep health check.
 */

process.env.RESEND_API_KEY = "re_test_key_monitoring";
process.env.EMAIL_FROM = "Store <alerts@example.com>";
process.env.ALERT_WEBHOOK_URL = "https://chat.example.com/hooks/abc";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const chatDown = vi.hoisted(() => ({ value: false }));
const sent = vi.hoisted(() => ({
  emails: [] as { to: string; subject: string; text: string }[],
  chat: [] as string[],
}));
vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
  if (String(url).startsWith("https://api.resend.com")) sent.emails.push(JSON.parse(init!.body!));
  else if (String(url).startsWith("https://chat.example.com")) {
    if (chatDown.value) return new Response("down", { status: 500 });
    sent.chat.push(init!.body!);
  }
  return new Response("{}", { status: 200 });
});

const { db } = await import("@/lib/db");
const { addMetric, sumMetric, pruneMetrics } = await import("@/lib/metrics");
const monitor = await import("@/services/monitor.service");
const { runDueJobs } = await import("@/services/jobs.service");
const { getDeepHealth } = await import("@/services/health.service");
const { cronTick } = await import("@/services/cron.service");

const RUN = `mon${Date.now().toString(36)}`;
const MIN = 60_000;
let categoryId = "";
let userId = "";
let seq = 0;

/** Clean slate for the counters and alert states these tests look at. */
async function reset() {
  await db.metric.deleteMany({});
  await db.alertState.deleteMany({});
  await db.job.deleteMany({ where: { type: "alerts.notify" } });
  await db.payment.deleteMany({ where: { providerOrderId: { startsWith: RUN } } });
  sent.emails.length = 0;
  sent.chat.length = 0;
}

async function payment(status: "FAILED" | "CAPTURED") {
  const order = await db.order.create({
    data: {
      userId,
      status: status === "CAPTURED" ? "PAID" : "FAILED",
      subtotalInPaise: 1,
      totalInPaise: 1,
      addressSnapshot: {},
    },
  });
  return db.payment.create({
    data: { orderId: order.id, providerOrderId: `${RUN}_${++seq}`, amountInPaise: 1, status },
  });
}

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: `${RUN} cat`, slug: `${RUN}-cat` } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
});
beforeEach(reset);
afterAll(async () => {
  await reset();
  await db.job.deleteMany({ where: { type: { startsWith: `${RUN}` } } });
  await db.payment.deleteMany({ where: { providerOrderId: { startsWith: RUN } } });
  await db.order.deleteMany({ where: { userId } });
  await db.product.deleteMany({ where: { slug: { startsWith: RUN } } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("payment outage", () => {
  it("gateway errors fire the alert at once, with one email and one chat message", async () => {
    for (let i = 0; i < 5; i++) await addMetric("payments.gateway_error");
    const changes = await monitor.evaluateAlerts(["payments"]);
    expect(changes).toEqual([expect.objectContaining({ key: "payments", change: "started" })]);
    await runDueJobs();
    expect(sent.emails.map((e) => e.subject)).toContain("[Alert] Payments are failing");
    expect(sent.emails[0]!.text).toContain("5 gateway error(s)");
    expect(sent.emails[0]!.text).toContain("RUNBOOK.md");
    expect(sent.chat).toHaveLength(1);
  });

  it("five checks at the same moment still send exactly one alert", async () => {
    for (let i = 0; i < 6; i++) await addMetric("payments.gateway_error");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => monitor.evaluateAlerts(["payments"])),
    );
    expect(results.flat().filter((c) => c.change === "started")).toHaveLength(1);
    const recipients = await monitor.alertRecipients();
    expect(await db.job.count({ where: { type: "alerts.notify" } })).toBe(recipients.length + 1);
  });

  it("a failing chat webhook is retried on its own — nobody gets the email twice", async () => {
    chatDown.value = true;
    try {
      for (let i = 0; i < 5; i++) await addMetric("payments.gateway_error");
      await monitor.evaluateAlerts(["payments"]);
      // Run the queue several times, making retries due at once each time.
      for (let round = 0; round < 4; round++) {
        await db.job.updateMany({
          where: { type: "alerts.notify", status: "PENDING" },
          data: { runAt: new Date(Date.now() - 1000) },
        });
        await runDueJobs();
      }
      const alerts = sent.emails.filter((e) => e.subject === "[Alert] Payments are failing");
      const recipients = await monitor.alertRecipients();
      expect(alerts).toHaveLength(recipients.length);
      expect(new Set(alerts.map((e) => e.to)).size).toBe(recipients.length);
      // Only the chat job is still failing / retrying.
      const notDone = await db.job.findMany({
        where: { type: "alerts.notify", status: { not: "DONE" } },
        select: { payload: true },
      });
      expect(notDone.length).toBe(1);
      expect(notDone[0]!.payload).toMatchObject({ chat: true });
    } finally {
      chatDown.value = false;
    }
  });

  it("no alert when most payments succeed, or when there are too few failures", async () => {
    for (let i = 0; i < 5; i++) await payment("FAILED");
    for (let i = 0; i < 10; i++) await payment("CAPTURED");
    expect((await monitor.checkPayments()).firing).toBe(false); // 33% failing
    await reset();
    for (let i = 0; i < 4; i++) await addMetric("payments.gateway_error");
    expect((await monitor.checkPayments()).firing).toBe(false); // only 4
  });

  it("declined payments (payment.failed) count too", async () => {
    for (let i = 0; i < 5; i++) await payment("FAILED");
    const r = await monitor.checkPayments();
    expect(r.firing).toBe(true);
    expect(r.detail).toContain("5 failed");
  });

  it("life cycle: started → quiet → reminder after repeat_hours → resolved", async () => {
    for (let i = 0; i < 5; i++) await addMetric("payments.gateway_error");
    const t0 = new Date();
    expect((await monitor.evaluateAlerts(["payments"], t0))[0]?.change).toBe("started");
    expect(await monitor.evaluateAlerts(["payments"], new Date(t0.getTime() + MIN))).toEqual([]);
    // Still failing 7 h later (counters "now" — re-add in that window).
    const later = new Date(t0.getTime() + 7 * 60 * MIN);
    for (let i = 0; i < 5; i++) await addMetric("payments.gateway_error", 1, later);
    expect((await monitor.evaluateAlerts(["payments"], later))[0]?.change).toBe("reminder");
    // An hour after that, nothing new has failed: resolved.
    const clear = new Date(later.getTime() + 60 * MIN);
    expect((await monitor.evaluateAlerts(["payments"], clear))[0]?.change).toBe("resolved");
    // One job per recipient per change: run the queue until they're all sent.
    while ((await runDueJobs({ limit: 200 })).done > 0);
    // One email per change, to each recipient (the jobs may run in any order).
    const subjects = sent.emails
      .map((e) => e.subject)
      .filter((x) => x.includes("Payments are failing"));
    const count = (x: string) => subjects.filter((y) => y === x).length;
    const perChange = count("[Alert] Payments are failing");
    expect(perChange).toBeGreaterThan(0);
    expect(count("[Still happening] Payments are failing")).toBe(perChange);
    expect(count("[Resolved] Payments are failing")).toBe(perChange);
    expect(subjects).toHaveLength(perChange * 3);
  });
});

describe("other alerts", () => {
  it("background jobs that gave up in the last 24 h", async () => {
    await db.job.create({
      data: {
        type: `${RUN}.old`,
        payload: {},
        status: "DEAD",
        finishedAt: new Date(Date.now() - 30 * 60 * MIN),
      },
    });
    expect((await monitor.checkDeadJobs()).detail).not.toContain(`${RUN}.old`);
    await db.job.create({
      data: { type: `${RUN}.job`, payload: {}, status: "DEAD", finishedAt: new Date() },
    });
    const r = await monitor.checkDeadJobs();
    expect(r.firing).toBe(true);
    expect(r.detail).toContain(`${RUN}.job ×1`);
  });

  it("webhooks: wrong signatures over the hourly limit", async () => {
    for (let i = 0; i < 9; i++) await addMetric("webhook.bad_signature");
    expect((await monitor.checkWebhooks()).firing).toBe(false);
    await addMetric("webhook.bad_signature");
    expect((await monitor.checkWebhooks()).firing).toBe(true);
  });

  it("error spike: 25 error lines in 10 minutes", async () => {
    await addMetric("log.error", 24);
    expect((await monitor.checkErrorSpike()).firing).toBe(false);
    await addMetric("log.error", 1);
    expect((await monitor.checkErrorSpike()).firing).toBe(true);
    // Older than 10 minutes doesn't count.
    expect((await monitor.checkErrorSpike(new Date(Date.now() + 11 * MIN))).firing).toBe(false);
  });

  it("no orders: fires when the last order is older than the limit", async () => {
    await db.order.create({
      data: {
        userId,
        status: "PAID",
        paidAt: new Date(),
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
      },
    });
    expect((await monitor.checkNoOrders()).firing).toBe(false);
    expect((await monitor.checkNoOrders(new Date(Date.now() + 49 * 60 * MIN))).firing).toBe(true);
  });

  it("best-seller out of stock", async () => {
    const p = await db.product.create({
      data: {
        name: `${RUN} Best Seller`,
        slug: `${RUN}-best`,
        description: "x",
        priceInPaise: 100,
        stock: 0,
        images: [],
        categoryId,
        metalType: "GOLD",
        purity: "K22",
        metalColour: "YELLOW",
        netWeightMg: 1,
        variants: {
          create: {
            sku: `${RUN}-BEST`.toUpperCase(),
            priceInPaise: 100,
            stock: 0,
            netWeightMg: 1,
            images: [],
          },
        },
      },
      include: { variants: true },
    });
    await db.order.create({
      data: {
        userId,
        status: "DELIVERED",
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
        items: {
          create: {
            productId: p.id,
            variantId: p.variants[0]!.id,
            productName: p.name,
            productSlug: p.slug,
            priceInPaise: 100,
            quantity: 1000, // certainly a top seller
            lineTotalInPaise: 100_000,
            productSnapshot: {},
          },
        },
      },
    });
    const r = await monitor.checkStockouts();
    expect(r.firing).toBe(true);
    expect(r.detail).toContain(`${RUN} Best Seller`);
  });
});

describe("plumbing", () => {
  it("alerts go to staff who can open Admin → System — never to support-only staff", async () => {
    const [support, owner] = await Promise.all([
      db.staffRole.findUniqueOrThrow({ where: { key: "SUPPORT" } }),
      db.staffRole.findUniqueOrThrow({ where: { key: "OWNER" } }),
    ]);
    // The oldest accounts in the database, so the 20-recipient cap can't hide the result.
    const longAgo = new Date("2000-01-01T00:00:00Z");
    const supportEmail = `${RUN}-support@example.com`;
    const ownerEmail = `${RUN}-owner@example.com`;
    await db.user.create({
      data: {
        email: supportEmail,
        role: "ADMIN",
        createdAt: longAgo,
        staffRoles: { create: { roleId: support.id } },
      },
    });
    await db.user.create({
      data: {
        email: ownerEmail,
        role: "ADMIN",
        createdAt: longAgo,
        staffRoles: { create: { roleId: owner.id } },
      },
    });
    try {
      const recipients = await monitor.alertRecipients();
      expect(recipients).toContain(ownerEmail);
      expect(recipients).not.toContain(supportEmail);
      expect(recipients.length).toBeLessThanOrEqual(20);
    } finally {
      await db.user.deleteMany({ where: { email: { in: [supportEmail, ownerEmail] } } });
    }
  });

  it("counters add up per minute and old ones are pruned", async () => {
    // A counter nothing else in this process writes (error log lines would add to log.error),
    // summed over 2 minutes so a minute boundary mid-test can't split it.
    await Promise.all(Array.from({ length: 20 }, () => addMetric("webhook.bad_signature")));
    expect(await sumMetric("webhook.bad_signature", 2)).toBe(20);
    await addMetric("webhook.bad_signature", 7, new Date(Date.now() - 5 * 24 * 60 * MIN));
    expect(await pruneMetrics(3)).toBe(1);
    expect(await sumMetric("webhook.bad_signature", 10)).toBe(20);
  });

  it("a cron tick runs the checks, records itself, and the deep health check reports it", async () => {
    for (let i = 0; i < 5; i++) await addMetric("payments.gateway_error");
    await cronTick();
    const health = await getDeepHealth();
    expect(health).toMatchObject({ status: "ok", db: "ok", cronMinutesAgo: 0 });
    expect(health.firingAlerts).toContain("payments");
    expect(health.dbMs).toBeGreaterThanOrEqual(0);
  });
});
