import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 20 — marketing against real PostgreSQL, with short test timers (1 min / 5 min).
 * "Done when": the cart sequence works, unsubscribe is honoured, back-in-stock fires on restock.
 */

process.env.RESEND_API_KEY = "re_test_key_marketing";
process.env.EMAIL_FROM = "Store <hello@example.com>";
process.env.MARKETING_ABANDONED_COUPON_PERCENT = "10";
process.env.MARKETING_REFERRAL_REWARD_RUPEES = "500";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

/** Every email "sent" through Resend. */
const outbox = vi.hoisted(
  () => [] as { to: string; subject: string; html: string; headers?: Record<string, string> }[],
);
vi.stubGlobal("fetch", async (url: string, init?: { body?: string }) => {
  if (String(url).startsWith("https://api.resend.com")) {
    outbox.push(JSON.parse(init?.body ?? "{}"));
    return new Response("{}", { status: 200 });
  }
  return new Response("{}", { status: 500 });
});

const { db } = await import("@/lib/db");
const m = await import("@/services/marketing.service");
const { runDueJobs } = await import("@/services/jobs.service");
const { checkCoupon } = await import("@/services/coupon.service");
const { setProductStock } = await import("@/services/admin/product-admin.service");
const { decodeEmail, verifyEmailLink } = await import("@/lib/marketing");
const { env } = await import("@/lib/env");

const RUN = `mk${Date.now().toString(36)}`;
const MIN = 60_000;
const short = { firstAfterMs: MIN, secondAfterMs: 5 * MIN };
let categoryId = "";
let seq = 0;
const userIds: string[] = [];
const emails: string[] = [];

async function user(phone = `98${String(Date.now() + ++seq).slice(-8)}`) {
  const email = `${RUN}-${++seq}@example.com`;
  emails.push(email);
  // Cart reminders are marketing: these shoppers opted in (Phase 27).
  const u = await db.user.create({
    data: { email, name: `Buyer ${seq}`, emailMarketingConsent: true },
  });
  userIds.push(u.id);
  await db.address.create({
    data: {
      userId: u.id,
      fullName: "B",
      phone,
      line1: "x",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500001",
    },
  });
  return { id: u.id, email };
}

async function product(stock: number) {
  const n = ++seq;
  const p = await db.product.create({
    data: {
      name: `${RUN} ring ${n}`,
      slug: `${RUN}-p${n}`,
      description: "x",
      priceInPaise: 1_000_00,
      stock,
      images: [],
      categoryId,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 1000,
      variants: {
        create: {
          sku: `${RUN}-P${n}`.toUpperCase(),
          priceInPaise: 1_000_00,
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

/** A cart whose last change was `minutesAgo` minutes ago. */
async function cartFor(userId: string, minutesAgo: number) {
  const p = await product(5);
  const cart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  const item = await db.cartItem.create({
    data: { cartId: cart.id, productId: p.id, variantId: p.variantId, quantity: 1 },
  });
  const when = new Date(Date.now() - minutesAgo * MIN);
  await db.$executeRaw`UPDATE "CartItem" SET "updatedAt" = ${when.toISOString()}::timestamp WHERE "id" = ${item.id}`;
  return when;
}

const later = (minutes: number) => new Date(Date.now() + minutes * MIN);
const mailsTo = (email: string) => outbox.filter((o) => o.to === email);
/** The scan is store-wide (other test files leave carts behind), so check one customer's rows. */
const stepsFor = async (userId: string) =>
  (await db.cartReminder.findMany({ where: { userId }, orderBy: { step: "asc" } })).map(
    (r) => r.step,
  );

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
});
beforeEach(async () => {
  outbox.length = 0;
  await db.job.deleteMany({});
});
afterAll(async () => {
  await db.job.deleteMany({});
  await db.cartReminder.deleteMany({ where: { userId: { in: userIds } } });
  await db.referral.deleteMany({ where: { referrerId: { in: userIds } } });
  await db.coupon.deleteMany({ where: { assignedUserId: { in: userIds } } });
  await db.stockAlert.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.subscriber.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.order.deleteMany({ where: { userId: { in: userIds } } });
  await db.cart.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

describe("cart reminders (short timers)", () => {
  it("no marketing consent → no reminder; once the customer opts in, it's sent (Phase 27)", async () => {
    const u = await user();
    await db.user.update({ where: { id: u.id }, data: { emailMarketingConsent: false } });
    await cartFor(u.id, 2);
    await m.scanAbandonedCarts(new Date(), short);
    expect(await stepsFor(u.id)).toEqual([]);
    await db.user.update({ where: { id: u.id }, data: { emailMarketingConsent: true } });
    await m.scanAbandonedCarts(new Date(), short);
    expect(await stepsFor(u.id)).toEqual([1]);
  });

  it("1st after 1 min, 2nd after 5 min with a personal single-use coupon, each sent once", async () => {
    const u = await user();
    await cartFor(u.id, 2);

    await m.scanAbandonedCarts(new Date(), short);
    await m.scanAbandonedCarts(new Date(), short);
    expect(await stepsFor(u.id)).toEqual([1]); // not twice
    await runDueJobs();
    expect(mailsTo(u.email).map((e) => e.subject)).toEqual(["You left something beautiful behind"]);
    const first = mailsTo(u.email)[0]!;
    expect(first.html).toContain("/unsubscribe?e=");
    expect(first.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    await m.scanAbandonedCarts(later(10), short); // 2nd step
    await runDueJobs();
    const reminders = await db.cartReminder.findMany({
      where: { userId: u.id },
      orderBy: { step: "asc" },
    });
    expect(reminders.map((r) => r.step)).toEqual([1, 2]);
    const code = reminders[1]!.couponCode!;
    expect(code).toMatch(/^BACK-[A-Z0-9]{6}$/);
    expect(mailsTo(u.email).at(-1)!.html).toContain(code);
    await m.scanAbandonedCarts(later(20), short);
    expect(await stepsFor(u.id)).toEqual([1, 2]); // never a 3rd

    // The coupon is personal and single-use.
    const coupon = await db.coupon.findUniqueOrThrow({ where: { code } });
    expect(coupon).toMatchObject({
      usageLimit: 1,
      perUserLimit: 1,
      assignedUserId: u.id,
      value: 10,
    });
    expect((await checkCoupon(code, u.id, 1_000_00)).ok).toBe(true);
    const other = await user();
    expect(await checkCoupon(code, other.id, 1_000_00)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/another account/),
    });
  });

  it("parallel scans queue one reminder", async () => {
    const u = await user();
    await cartFor(u.id, 2);
    await Promise.all([1, 2, 3].map(() => m.scanAbandonedCarts(new Date(), short)));
    expect(await stepsFor(u.id)).toEqual([1]);
  });

  it("stops on purchase: no reminder after an order, and a queued one isn't sent if they order first", async () => {
    const a = await user();
    const last = await cartFor(a.id, 2);
    await db.order.create({
      data: {
        userId: a.id,
        status: "PAID",
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
        createdAt: new Date(last.getTime() + 1000),
      },
    });
    await m.scanAbandonedCarts(new Date(), short);
    expect(await stepsFor(a.id)).toEqual([]);

    const b = await user();
    await cartFor(b.id, 2);
    await m.scanAbandonedCarts(new Date(), short);
    expect(await stepsFor(b.id)).toEqual([1]);
    // They order after the reminder was queued, before it went out.
    await db.order.create({
      data: {
        userId: b.id,
        status: "CONFIRMED",
        paymentMethod: "COD",
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
        createdAt: later(0.1),
      },
    });
    await runDueJobs();
    expect(mailsTo(b.email)).toHaveLength(0);
    await m.markRecoveredCarts(later(1));
    expect(
      (await db.cartReminder.findFirstOrThrow({ where: { userId: b.id } })).recoveredAt,
    ).not.toBeNull();
  });

  it("unsubscribe is honoured: before the scan, and for a reminder already queued", async () => {
    const a = await user();
    await cartFor(a.id, 2);
    await m.unsubscribe(a.email);
    await m.scanAbandonedCarts(new Date(), short);
    expect(await stepsFor(a.id)).toEqual([]);

    const b = await user();
    await cartFor(b.id, 2);
    await m.scanAbandonedCarts(new Date(), short);
    expect(await stepsFor(b.id)).toEqual([1]);
    await m.unsubscribe(b.email.toUpperCase()); // any letter case
    await runDueJobs();
    expect(mailsTo(b.email)).toHaveLength(0);
  });

  it("a cart changed again gets a fresh reminder; an empty cart gets none", async () => {
    const u = await user();
    await cartFor(u.id, 2);
    await m.scanAbandonedCarts(new Date(), short);
    await cartFor(u.id, 1.5); // added something → new cart version
    await m.scanAbandonedCarts(new Date(), short);
    expect(await db.cartReminder.count({ where: { userId: u.id, step: 1 } })).toBe(2);

    const e = await user();
    await cartFor(e.id, 2);
    await m.scanAbandonedCarts(new Date(), short);
    await db.cartItem.deleteMany({ where: { cart: { userId: e.id } } });
    await runDueJobs();
    expect(mailsTo(e.email)).toHaveLength(0);
  });
});

describe("newsletter (double opt-in) and unsubscribe links", () => {
  it("sign-up stores consent, confirms once by the emailed link, re-confirmation needed after unsubscribing", async () => {
    const email = `${RUN}-news@example.com`;
    await m.subscribeNewsletter(email.toUpperCase(), "footer");
    const sub = await db.subscriber.findUniqueOrThrow({ where: { email } });
    expect(sub).toMatchObject({
      status: "PENDING",
      consentSource: "footer",
      consentText: m.NEWSLETTER_CONSENT_TEXT,
    });
    expect(sub.consentAt).not.toBeNull();

    await runDueJobs();
    const mail = mailsTo(email)[0]!;
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.html)![1]!;
    expect(sub.confirmHash).not.toContain(token); // only a hash is stored
    expect(await m.confirmNewsletter("wrong-token-wrong-token-wrong")).toBe(false);
    expect(await m.confirmNewsletter(token)).toBe(true);
    expect(await m.confirmNewsletter(token)).toBe(false); // used
    expect((await db.subscriber.findUniqueOrThrow({ where: { email } })).status).toBe("SUBSCRIBED");

    outbox.length = 0;
    await m.subscribeNewsletter(email, "footer"); // already subscribed: nothing sent
    await runDueJobs();
    expect(mailsTo(email)).toHaveLength(0);

    await m.unsubscribe(email);
    await m.subscribeNewsletter(email, "footer");
    expect((await db.subscriber.findUniqueOrThrow({ where: { email } })).status).toBe("PENDING");
  });

  it("a confirmation link expires after 7 days", async () => {
    const email = `${RUN}-old@example.com`;
    await m.subscribeNewsletter(email, "footer");
    await runDueJobs();
    const token = /token=([A-Za-z0-9_-]+)/.exec(mailsTo(email)[0]!.html)![1]!;
    await db.subscriber.update({
      where: { email },
      data: { consentAt: new Date(Date.now() - 8 * 24 * 60 * MIN) },
    });
    expect(await m.confirmNewsletter(token)).toBe(false);
  });

  it("the emailed unsubscribe link is signed for that address only", async () => {
    const url = new URL(m.unsubscribeUrl(`${RUN}-x@example.com`));
    const e = decodeEmail(url.searchParams.get("e")!)!;
    const t = url.searchParams.get("t")!;
    expect(verifyEmailLink(e, "unsubscribe", t, env.AUTH_SECRET)).toBe(true);
    expect(verifyEmailLink(`${RUN}-y@example.com`, "unsubscribe", t, env.AUTH_SECRET)).toBe(false);
  });
});

describe("back in stock", () => {
  it("fires once when an admin restocks; not while sold out; refused when already in stock", async () => {
    const p = await product(0);
    const email = `${RUN}-bis@example.com`;
    await m.requestStockAlert({ email, variantId: p.variantId });
    await m.requestStockAlert({ email: email.toUpperCase(), variantId: p.variantId }); // same person
    expect(await db.stockAlert.count({ where: { variantId: p.variantId } })).toBe(1);

    await m.runMarketingScan();
    await runDueJobs();
    expect(mailsTo(email)).toHaveLength(0); // still sold out

    await setProductStock(p.id, 3, "admin"); // queues a marketing scan
    await runDueJobs(); // scan → email job
    await runDueJobs();
    expect(mailsTo(email).map((x) => x.subject)).toEqual([expect.stringMatching(/^Back in stock/)]);
    await m.runMarketingScan();
    await runDueJobs();
    expect(mailsTo(email)).toHaveLength(1); // once

    await expect(m.requestStockAlert({ email, variantId: p.variantId })).rejects.toThrow(
      /in stock/,
    );
  });

  it("sold out again before the email went: not sent, and they stay on the list", async () => {
    const p = await product(0);
    const email = `${RUN}-bis2@example.com`;
    await m.requestStockAlert({ email, variantId: p.variantId });
    await db.productVariant.update({ where: { id: p.variantId }, data: { stock: 1 } });
    await m.scanStockAlerts();
    await db.productVariant.update({ where: { id: p.variantId }, data: { reservedStock: 1 } });
    await runDueJobs();
    expect(mailsTo(email)).toHaveLength(0);
    expect((await db.stockAlert.findFirstOrThrow({ where: { email } })).notifiedAt).toBeNull();
  });
});

describe("referrals", () => {
  async function delivered(userId: string, phone: string) {
    await db.order.create({
      data: {
        userId,
        status: "DELIVERED",
        subtotalInPaise: 1,
        totalInPaise: 1,
        deliveredAt: new Date(),
        addressSnapshot: { phone },
      },
    });
  }

  it("friend's first delivered order → one ₹500 personal coupon for the referrer, even with parallel scans", async () => {
    const a = await user("9811111111");
    const b = await user("9822222222");
    const code = await m.getReferralCode(a.id);
    expect(await m.getReferralCode(a.id)).toBe(code); // stable
    expect(await m.linkReferral(a.id, code)).toBe(false); // own code
    expect(await m.linkReferral(b.id, code)).toBe(true);
    expect(await m.linkReferral(b.id, code)).toBe(false); // only once
    expect(await m.linkReferral(b.id, "NOPE1234")).toBe(false);

    expect((await m.scanReferrals()).rewarded).toBe(0); // no delivered order yet
    await delivered(b.id, "9822222222");
    const runs = await Promise.all([m.scanReferrals(), m.scanReferrals(), m.scanReferrals()]);
    expect(runs.reduce((s, r) => s + r.rewarded, 0)).toBe(1);

    const referral = await db.referral.findUniqueOrThrow({ where: { referredUserId: b.id } });
    expect(referral.status).toBe("REWARDED");
    const coupon = await db.coupon.findUniqueOrThrow({ where: { code: referral.rewardCode! } });
    expect(coupon).toMatchObject({
      type: "FLAT",
      value: 500_00,
      minOrderInPaise: 2000_00,
      usageLimit: 1,
      assignedUserId: a.id,
      campaign: "referral",
    });
    expect(await db.coupon.count({ where: { assignedUserId: a.id, campaign: "referral" } })).toBe(
      1,
    );
    await runDueJobs();
    expect(mailsTo(a.email)[0]!.html).toContain(referral.rewardCode!);
    expect((await checkCoupon(referral.rewardCode!, b.id, 3000_00)).ok).toBe(false); // not the friend's
  });

  it("same phone number on both accounts → voided as a self-referral, no coupon", async () => {
    const a = await user("9833333333");
    const b = await user("9844444444");
    await m.linkReferral(b.id, await m.getReferralCode(a.id));
    await delivered(b.id, "+91 98333 33333"); // the referrer's own number, written differently
    expect(await m.scanReferrals()).toMatchObject({ rewarded: 0, voided: 1 });
    expect((await db.referral.findUniqueOrThrow({ where: { referredUserId: b.id } })).status).toBe(
      "VOID",
    );
    expect(await db.coupon.count({ where: { assignedUserId: a.id } })).toBe(0);
  });
});

describe("campaign stats", () => {
  it("counts what happened", async () => {
    const s = await m.campaignStats(1);
    expect(s.cartReminders.first).toBeGreaterThanOrEqual(4);
    expect(s.cartReminders.second).toBeGreaterThanOrEqual(1);
    expect(s.cartReminders.couponsIssued).toBeGreaterThanOrEqual(1);
    expect(s.referrals.rewarded).toBeGreaterThanOrEqual(1);
    expect(s.referrals.voided).toBeGreaterThanOrEqual(1);
    expect(s.newsletter.unsubscribed).toBeGreaterThanOrEqual(2);
    expect(s.backInStock.sent).toBeGreaterThanOrEqual(1);
  });
});
