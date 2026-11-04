import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  dueReminderStep,
  encodeEmail,
  normaliseEmail,
  randomCode,
  REMINDER_MAX_AGE_MS,
  signEmailLink,
} from "@/lib/marketing";
import { normaliseMobile } from "@/lib/cod";
import { enqueue, kickJobs } from "@/services/jobs.service";

/**
 * Marketing (Phase 20): newsletter with double opt-in, one "do not email" list, cart reminders,
 * back-in-stock alerts and referrals. Emails are background jobs ("email.marketing"); the
 * unsubscribe list is checked again when each one is SENT, so an unsubscribe also stops
 * reminders that were already queued.
 */

type Tx = Prisma.TransactionClient;
const DAY = 24 * 60 * 60_000;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const utc = (d: Date) => d.toISOString();

/** Shown next to the sign-up box and stored with each consent. */
export const NEWSLETTER_CONSENT_TEXT =
  "Send me news about new collections and offers by email. I can unsubscribe at any time.";

// ───────────────────────── unsubscribe list ─────────────────────────

export function unsubscribeUrl(email: string): string {
  const e = encodeEmail(email);
  const t = signEmailLink(email, "unsubscribe", env.AUTH_SECRET);
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/unsubscribe?e=${e}&t=${t}`;
}

export async function isUnsubscribed(email: string): Promise<boolean> {
  const row = await db.subscriber.findUnique({
    where: { email: normaliseEmail(email) },
    select: { status: true },
  });
  return row?.status === "UNSUBSCRIBED";
}

/** Stops all marketing email to this address (newsletter, cart reminders). Idempotent. */
export async function unsubscribe(email: string, source = "link"): Promise<void> {
  const e = normaliseEmail(email);
  const now = new Date();
  await db.subscriber.upsert({
    where: { email: e },
    update: { status: "UNSUBSCRIBED", unsubscribedAt: now, confirmHash: null },
    create: { email: e, status: "UNSUBSCRIBED", unsubscribedAt: now, consentSource: source },
  });
  logger.info("marketing.unsubscribed", { source });
}

// ───────────────────────── newsletter ─────────────────────────

/**
 * Sign-up: stores the consent (time, place, wording) and emails a confirmation link. Always
 * answers the same way, so the form can't be used to find out who is subscribed.
 */
export async function subscribeNewsletter(email: string, source: string): Promise<void> {
  const e = normaliseEmail(email);
  const existing = await db.subscriber.findUnique({ where: { email: e } });
  if (existing?.status === "SUBSCRIBED") return;
  const token = randomBytes(24).toString("base64url");
  const data = {
    status: "PENDING" as const,
    confirmHash: sha256(token),
    consentAt: new Date(),
    consentSource: source.slice(0, 40),
    consentText: NEWSLETTER_CONSENT_TEXT,
    unsubscribedAt: null,
  };
  await db.subscriber.upsert({ where: { email: e }, update: data, create: { email: e, ...data } });
  await enqueue(
    "email.marketing",
    { kind: "newsletter_confirm", to: e, token },
    { dedupeKey: `newsletter-confirm:${e}` },
  );
  await kickJobs();
}

/** Second step of double opt-in. Links expire after 7 days. */
export async function confirmNewsletter(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return false;
  const res = await db.subscriber.updateMany({
    where: {
      confirmHash: sha256(token),
      status: "PENDING",
      consentAt: { gt: new Date(Date.now() - 7 * DAY) },
    },
    data: { status: "SUBSCRIBED", confirmedAt: new Date(), confirmHash: null },
  });
  return res.count === 1;
}

// ───────────────────────── personal coupons ─────────────────────────

async function createPersonalCoupon(
  tx: Tx,
  input: {
    prefix: string;
    userId: string;
    campaign: string;
    type: "PERCENT" | "FLAT";
    value: number;
    minOrderInPaise: number;
    days: number;
  },
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = `${input.prefix}-${randomCode(6)}`;
    const made = await tx.coupon.createMany({
      data: [
        {
          code,
          type: input.type,
          value: input.value,
          minOrderInPaise: input.minOrderInPaise,
          usageLimit: 1,
          perUserLimit: 1,
          endsAt: new Date(Date.now() + input.days * DAY),
          assignedUserId: input.userId,
          campaign: input.campaign,
        },
      ],
      skipDuplicates: true,
    });
    if (made.count === 1) return code;
  }
  throw new Error("Couldn't make a unique coupon code");
}

// ───────────────────────── cart reminders ─────────────────────────

const NOT_A_PURCHASE = ["PENDING", "FAILED"] as const;

/**
 * Finds carts left alone long enough and queues the 1st / 2nd reminder. Each reminder row is
 * unique per (customer, cart version, step), so running this twice — or in parallel — sends
 * nothing twice. Signed-in customers only (guests have no email address).
 */
export async function scanAbandonedCarts(
  now = new Date(),
  rules = {
    firstAfterMs: config.marketing.abandoned_first_minutes * 60_000,
    secondAfterMs: config.marketing.abandoned_second_hours * 60 * 60_000,
  },
): Promise<{ queued: number }> {
  if (!config.marketing.abandoned_cart) return { queued: 0 };
  const newest = new Date(now.getTime() - rules.firstAfterMs);
  const oldest = new Date(now.getTime() - REMINDER_MAX_AGE_MS);
  const carts = await db.$queryRaw<{ userId: string; lastActivity: Date; email: string }[]>`
    SELECT c."userId", MAX(i."updatedAt") AS "lastActivity", u."email"
      FROM "Cart" c
      JOIN "CartItem" i ON i."cartId" = c."id"
      JOIN "User" u ON u."id" = c."userId"
     GROUP BY c."userId", u."email"
    HAVING MAX(i."updatedAt") <= ${utc(newest)}::timestamp
       AND MAX(i."updatedAt") >= ${utc(oldest)}::timestamp
     LIMIT 500`;

  let queued = 0;
  for (const cart of carts) {
    const [sent, ordered, unsubscribed] = await Promise.all([
      db.cartReminder.findMany({
        where: { userId: cart.userId, cartVersion: cart.lastActivity },
        select: { step: true, sentAt: true },
      }),
      db.order.count({
        where: {
          userId: cart.userId,
          createdAt: { gt: cart.lastActivity },
          status: { notIn: [...NOT_A_PURCHASE] },
        },
      }),
      isUnsubscribed(cart.email),
    ]);
    const step = dueReminderStep({
      lastActivity: cart.lastActivity,
      now,
      sent,
      orderedSince: ordered > 0,
      unsubscribed,
      rules,
    });
    if (step === 0) continue;

    const created = await db.$transaction(async (tx) => {
      const row = await tx.cartReminder.createMany({
        data: [{ userId: cart.userId, cartVersion: cart.lastActivity, step }],
        skipDuplicates: true,
      });
      if (row.count === 0) return false; // another run got there first
      const reminder = await tx.cartReminder.findUniqueOrThrow({
        where: {
          userId_cartVersion_step: { userId: cart.userId, cartVersion: cart.lastActivity, step },
        },
        select: { id: true },
      });
      const percent = config.marketing.abandoned_coupon_percent;
      if (step === 2 && percent > 0) {
        const code = await createPersonalCoupon(tx, {
          prefix: "BACK",
          userId: cart.userId,
          campaign: "abandoned_cart",
          type: "PERCENT",
          value: percent,
          minOrderInPaise: 0,
          days: 7,
        });
        await tx.cartReminder.update({ where: { id: reminder.id }, data: { couponCode: code } });
      }
      await enqueue("email.marketing", { kind: "cart_reminder", reminderId: reminder.id }, { tx });
      return true;
    });
    if (created) queued++;
  }
  if (queued) logger.info("marketing.cart_reminders_queued", { queued });
  return { queued };
}

/** Marks reminders whose customer ordered within 7 days of the email (for campaign stats). */
export async function markRecoveredCarts(now = new Date()): Promise<number> {
  const open = await db.cartReminder.findMany({
    where: { recoveredAt: null, sentAt: { gt: new Date(now.getTime() - 8 * DAY) } },
    select: { id: true, userId: true, sentAt: true },
    take: 1000,
  });
  let marked = 0;
  for (const r of open) {
    const order = await db.order.findFirst({
      where: {
        userId: r.userId,
        createdAt: { gt: r.sentAt, lt: new Date(r.sentAt.getTime() + 7 * DAY) },
        status: { notIn: [...NOT_A_PURCHASE] },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (order) {
      await db.cartReminder.update({ where: { id: r.id }, data: { recoveredAt: order.createdAt } });
      marked++;
    }
  }
  return marked;
}

// ───────────────────────── back in stock ─────────────────────────

export class StockAlertError extends Error {}

export async function requestStockAlert(input: {
  email: string;
  variantId: string;
  userId?: string | null;
}): Promise<void> {
  const variant = await db.productVariant.findUnique({
    where: { id: input.variantId },
    select: {
      id: true,
      productId: true,
      isActive: true,
      stock: true,
      reservedStock: true,
      product: { select: { isActive: true } },
    },
  });
  if (!variant || !variant.isActive || !variant.product.isActive)
    throw new StockAlertError("This piece isn't available any more.");
  if (variant.stock - variant.reservedStock > 0)
    throw new StockAlertError("Good news — it's in stock right now.");
  const email = normaliseEmail(input.email);
  await db.stockAlert.upsert({
    where: { email_variantId: { email, variantId: variant.id } },
    update: { notifiedAt: null, userId: input.userId ?? undefined },
    create: { email, variantId: variant.id, productId: variant.productId, userId: input.userId },
  });
}

/**
 * Sends "back in stock" for every waiting alert whose variant can be bought again — whichever
 * way the stock came back (admin edit, return, cancellation, expired hold). Each alert is
 * claimed with a conditional update, so it's emailed once.
 */
export async function scanStockAlerts(): Promise<{ queued: number }> {
  const waiting = await db.stockAlert.findMany({
    where: { notifiedAt: null, variant: { isActive: true, product: { isActive: true } } },
    select: { id: true, variant: { select: { stock: true, reservedStock: true } } },
    take: 500,
  });
  let queued = 0;
  for (const alert of waiting) {
    if (alert.variant.stock - alert.variant.reservedStock <= 0) continue;
    const claimed = await db.$transaction(async (tx) => {
      const res = await tx.stockAlert.updateMany({
        where: { id: alert.id, notifiedAt: null },
        data: { notifiedAt: new Date() },
      });
      if (res.count === 0) return false;
      await enqueue("email.marketing", { kind: "back_in_stock", alertId: alert.id }, { tx });
      return true;
    });
    if (claimed) queued++;
  }
  if (queued) logger.info("marketing.back_in_stock_queued", { queued });
  return { queued };
}

/** Called after stock goes back up: run the marketing scan soon instead of waiting for cron. */
export async function nudgeStockAlerts(tx?: Tx): Promise<void> {
  await enqueue("marketing.scan", {}, { tx, dedupeKey: "marketing:scan" });
  if (!tx) await kickJobs();
}

// ───────────────────────── referrals ─────────────────────────

export const REFERRAL_COOKIE = "ref";

export async function getReferralCode(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (user?.referralCode) return user.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = randomCode(8);
    const res = await db.user.updateMany({
      where: { id: userId, referralCode: null },
      data: { referralCode: code },
    });
    if (res.count === 1) return code;
    const again = await db.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (again?.referralCode) return again.referralCode;
  }
  throw new Error("Couldn't create a referral code");
}

export function referralLink(code: string): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/r/${code}`;
}

/** At sign-up: links the new customer to whoever referred them. Ignores bad or own codes. */
export async function linkReferral(newUserId: string, code: string | undefined): Promise<boolean> {
  if (!code || !/^[A-Z0-9]{6,12}$/.test(code) || config.marketing.referral_reward_rupees === 0)
    return false;
  const referrer = await db.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!referrer || referrer.id === newUserId) return false;
  const res = await db.referral.createMany({
    data: [{ referrerId: referrer.id, referredUserId: newUserId }],
    skipDuplicates: true,
  });
  if (res.count === 1) logger.info("marketing.referral_linked", { referrerId: referrer.id });
  return res.count === 1;
}

/** Phone numbers a customer has used (saved addresses + order addresses), normalised. */
async function phonesOf(userId: string): Promise<Set<string>> {
  const [addresses, orders] = await Promise.all([
    db.address.findMany({ where: { userId }, select: { phone: true } }),
    db.order.findMany({ where: { userId }, select: { addressSnapshot: true }, take: 50 }),
  ]);
  const raw = [
    ...addresses.map((a) => a.phone),
    ...orders.map((o) => (o.addressSnapshot as { phone?: string } | null)?.phone ?? ""),
  ];
  return new Set(raw.map((p) => normaliseMobile(p)).filter((p): p is string => Boolean(p)));
}

/**
 * Rewards referrers whose friend's first order has been delivered. A referral where both
 * accounts share a phone number is treated as a self-referral and voided. Each referral is
 * decided once (conditional PENDING → REWARDED/VOID).
 */
export async function scanReferrals(): Promise<{ rewarded: number; voided: number }> {
  const reward = config.marketing.referral_reward_rupees;
  if (reward === 0) return { rewarded: 0, voided: 0 };
  const pending = await db.referral.findMany({
    where: { status: "PENDING", referred: { orders: { some: { status: "DELIVERED" } } } },
    select: { id: true, referrerId: true, referredUserId: true },
    take: 200,
  });
  let rewarded = 0;
  let voided = 0;
  for (const r of pending) {
    const [mine, theirs] = await Promise.all([phonesOf(r.referrerId), phonesOf(r.referredUserId)]);
    const shared = [...theirs].some((p) => mine.has(p));
    if (shared) {
      const res = await db.referral.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: {
          status: "VOID",
          voidReason: "Same phone number as the referrer",
          decidedAt: new Date(),
        },
      });
      voided += res.count;
      continue;
    }
    const done = await db.$transaction(async (tx) => {
      const res = await tx.referral.updateMany({
        where: { id: r.id, status: "PENDING" },
        data: { status: "REWARDED", decidedAt: new Date() },
      });
      if (res.count === 0) return false;
      const code = await createPersonalCoupon(tx, {
        prefix: "THANKS",
        userId: r.referrerId,
        campaign: "referral",
        type: "FLAT",
        value: reward * 100,
        minOrderInPaise: config.marketing.referral_min_order_rupees * 100,
        days: 90,
      });
      await tx.referral.update({ where: { id: r.id }, data: { rewardCode: code } });
      await enqueue("email.marketing", { kind: "referral_reward", referralId: r.id }, { tx });
      return true;
    });
    if (done) rewarded++;
  }
  if (rewarded || voided) logger.info("marketing.referrals_decided", { rewarded, voided });
  return { rewarded, voided };
}

export async function referralSummary(userId: string) {
  const rows = await db.referral.groupBy({
    by: ["status"],
    where: { referrerId: userId },
    _count: true,
  });
  const count = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  return { pending: count("PENDING"), rewarded: count("REWARDED") };
}

// ───────────────────────── the scheduled scan ─────────────────────────

export async function runMarketingScan(now = new Date()) {
  const carts = await scanAbandonedCarts(now);
  const recovered = await markRecoveredCarts(now);
  const alerts = await scanStockAlerts();
  const referrals = await scanReferrals();
  return { cartReminders: carts.queued, recovered, backInStock: alerts.queued, ...referrals };
}

// ───────────────────────── campaign stats (admin) ─────────────────────────

export async function campaignStats(days = 30) {
  const since = new Date(Date.now() - days * DAY);
  const [subs, reminders, recovered, couponUses, alerts, alertsSent, referrals] = await Promise.all(
    [
      db.subscriber.groupBy({ by: ["status"], _count: true }),
      db.cartReminder.groupBy({ by: ["step"], where: { sentAt: { gte: since } }, _count: true }),
      db.cartReminder.count({ where: { sentAt: { gte: since }, recoveredAt: { not: null } } }),
      db.coupon.groupBy({
        by: ["campaign"],
        where: { campaign: { not: null }, createdAt: { gte: since } },
        _count: true,
        _sum: { usedCount: true },
      }),
      db.stockAlert.count({ where: { notifiedAt: null } }),
      db.stockAlert.count({ where: { notifiedAt: { gte: since } } }),
      db.referral.groupBy({ by: ["status"], _count: true }),
    ],
  );
  const sub = (s: string) => subs.find((r) => r.status === s)?._count ?? 0;
  const step = (n: number) => reminders.find((r) => r.step === n)?._count ?? 0;
  const ref = (s: string) => referrals.find((r) => r.status === s)?._count ?? 0;
  const camp = (c: string) => couponUses.find((r) => r.campaign === c);
  return {
    days,
    newsletter: {
      pending: sub("PENDING"),
      subscribed: sub("SUBSCRIBED"),
      unsubscribed: sub("UNSUBSCRIBED"),
    },
    cartReminders: {
      first: step(1),
      second: step(2),
      recovered,
      couponsIssued: camp("abandoned_cart")?._count ?? 0,
      couponsUsed: camp("abandoned_cart")?._sum.usedCount ?? 0,
    },
    backInStock: { waiting: alerts, sent: alertsSent },
    referrals: {
      pending: ref("PENDING"),
      rewarded: ref("REWARDED"),
      voided: ref("VOID"),
      couponsUsed: camp("referral")?._sum.usedCount ?? 0,
    },
  };
}
