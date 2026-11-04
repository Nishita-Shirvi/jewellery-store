import "server-only";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listAddresses, openSnapshot } from "@/services/address.service";

/**
 * Privacy (Phase 27, India's DPDP Act 2023): consents, "download my data", "delete my account",
 * and the daily clean-up of data that's no longer needed.
 */

export const CONSENT_CHANNELS = ["email_marketing", "sms_updates", "analytics"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];
export type ConsentSource =
  "register" | "account" | "cookie_banner" | "unsubscribe_link" | "account_deleted";

export class PrivacyError extends Error {}

/**
 * Records a consent given or withdrawn (always logged; never edited) and applies it.
 * Analytics consent lives in the browser's cookie; it's logged here for signed-in customers.
 */
export async function setConsent(
  userId: string,
  channel: ConsentChannel,
  granted: boolean,
  source: ConsentSource,
) {
  await db.$transaction(async (tx) => {
    if (channel === "email_marketing")
      await tx.user.update({ where: { id: userId }, data: { emailMarketingConsent: granted } });
    if (channel === "sms_updates")
      await tx.user.update({ where: { id: userId }, data: { smsUpdatesConsent: granted } });
    await tx.consentEvent.create({ data: { userId, channel, granted, source } });
  });
  logger.info("privacy.consent", { userId, channel, granted, source });
}

export async function getConsents(userId: string) {
  const [user, history] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { emailMarketingConsent: true, smsUpdatesConsent: true },
    }),
    db.consentEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { channel: true, granted: true, source: true, createdAt: true },
    }),
  ]);
  return { ...user, history };
}

/** Statuses where the order is still being dealt with: the account can't be deleted yet. */
const OPEN_ORDER = ["CONFIRMED", "PAID", "SHIPPED", "RETURN_REQUESTED", "REFUND_PENDING"] as const;

/**
 * "Download my data": everything we hold about the customer, readable (addresses decrypted).
 * Internal staff notes on support tickets aren't the customer's data and aren't included.
 */
export async function exportUserData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      emailMarketingConsent: true,
      smsUpdatesConsent: true,
      referralCode: true,
      accounts: { select: { provider: true } },
    },
  });
  const [addresses, orders, reviews, wishlist, tickets, consents, stockAlerts, subscriber] =
    await Promise.all([
      listAddresses(userId),
      db.order.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          paidAt: true,
          totalInPaise: true,
          paymentMethod: true,
          couponCode: true,
          addressSnapshot: true,
          items: {
            select: {
              productName: true,
              variantLabel: true,
              quantity: true,
              lineTotalInPaise: true,
            },
          },
        },
      }),
      db.review.findMany({
        where: { userId },
        select: {
          rating: true,
          title: true,
          body: true,
          status: true,
          createdAt: true,
          product: { select: { name: true } },
        },
      }),
      db.wishlistItem.findMany({
        where: { userId },
        select: { createdAt: true, product: { select: { name: true } } },
      }),
      db.supportTicket.findMany({
        where: { userId },
        select: {
          subject: true,
          status: true,
          createdAt: true,
          messages: {
            where: { internal: false },
            select: { body: true, fromStaff: true, createdAt: true },
          },
        },
      }),
      db.consentEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { channel: true, granted: true, source: true, createdAt: true },
      }),
      db.stockAlert.findMany({
        where: { userId },
        select: {
          createdAt: true,
          notifiedAt: true,
          variant: { select: { product: { select: { name: true } } } },
        },
      }),
      db.subscriber.findUnique({
        where: { email: user.email },
        select: { status: true, consentAt: true, confirmedAt: true, unsubscribedAt: true },
      }),
    ]);
  return {
    exportedAt: new Date().toISOString(),
    about:
      "Your personal data held by the store (Digital Personal Data Protection Act, 2023). " +
      "Card and UPI details are never stored by us.",
    account: {
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      signInWith: user.accounts.map((a) => a.provider),
      referralCode: user.referralCode,
    },
    consents: {
      marketingEmails: user.emailMarketingConsent,
      orderUpdateSms: user.smsUpdatesConsent,
      history: consents,
      newsletter: subscriber,
    },
    addresses: addresses.map((a) => ({
      fullName: a.fullName,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2,
      landmark: a.landmark,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      isDefault: a.isDefault,
    })),
    orders: orders.map((o) => ({ ...o, addressSnapshot: openSnapshot(o.addressSnapshot) })),
    reviews: reviews.map((r) => ({ ...r, product: r.product.name })),
    wishlist: wishlist.map((w) => ({ product: w.product.name, addedAt: w.createdAt })),
    supportTickets: tickets,
    backInStockRequests: stockAlerts.map((s) => ({
      product: s.variant.product.name,
      requestedAt: s.createdAt,
      notifiedAt: s.notifiedAt,
    })),
  };
}

/**
 * "Delete my account". Removes personal data; keeps orders and invoices (tax law requires them,
 * with their delivery address, encrypted). Reviews stay, shown as "Former customer".
 * Refused for staff and while an order is still open (payment, delivery, return or refund).
 */
export async function deleteAccount(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new PrivacyError("This account has already been deleted.");
  if (user.role === "ADMIN")
    throw new PrivacyError("Staff accounts are closed by the store owner (Admin → Staff).");
  const open = await db.order.count({ where: { userId, status: { in: [...OPEN_ORDER] } } });
  if (open > 0)
    throw new PrivacyError(
      `You have ${open} order(s) still in progress. Once they're delivered (or cancelled / refunded), you can delete your account.`,
    );

  const email = user.email;
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.address.deleteMany({ where: { userId } });
    await tx.wishlistItem.deleteMany({ where: { userId } });
    await tx.cart.deleteMany({ where: { userId } });
    await tx.cartReminder.deleteMany({ where: { userId } });
    await tx.otpChallenge.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.stockAlert.deleteMany({ where: { OR: [{ userId }, { email }] } });
    await tx.subscriber.deleteMany({ where: { email } });
    await tx.supportTicket.deleteMany({ where: { userId } }); // messages + attachments cascade
    await tx.account.deleteMany({ where: { userId } }); // Google sign-in link
    await tx.session.deleteMany({ where: { userId } });
    await tx.review.updateMany({ where: { userId }, data: { authorName: "Former customer" } });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted+${userId}@deleted.invalid`,
        name: null,
        image: null,
        emailVerified: null,
        passwordHash: null,
        referralCode: null,
        totpSecret: null,
        totpEnabledAt: null,
        recoveryCodes: [],
        emailMarketingConsent: false,
        smsUpdatesConsent: false,
        deletedAt: now,
        // Signs the person out on every device at the next session check (auth.ts).
        passwordChangedAt: now,
      },
    });
    await tx.consentEvent.create({
      data: { userId, channel: "email_marketing", granted: false, source: "account_deleted" },
    });
  });
  logger.info("privacy.account_deleted", { userId });
}

/**
 * Daily clean-up of data no longer needed ([privacy] in config.ini). Orders, invoices, payments
 * and refunds are never touched. Idempotent: running it again deletes nothing new.
 */
export async function purgeOldData(now = new Date()) {
  const p = config.privacy;
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const results = {
    otpChallenges: (
      await db.otpChallenge.deleteMany({ where: { createdAt: { lt: ago(p.otp_days) } } })
    ).count,
    passwordResets: (
      await db.passwordResetToken.deleteMany({
        where: { createdAt: { lt: ago(p.password_reset_days) } },
      })
    ).count,
    cartReminders: (
      await db.cartReminder.deleteMany({ where: { sentAt: { lt: ago(p.cart_reminder_days) } } })
    ).count,
    stockAlerts: (
      await db.stockAlert.deleteMany({
        where: {
          OR: [
            { notifiedAt: { lt: ago(p.stock_alert_days) } },
            { notifiedAt: null, createdAt: { lt: ago(p.stock_alert_days) } },
          ],
        },
      })
    ).count,
    unconfirmedSubscribers: (
      await db.subscriber.deleteMany({
        where: { status: "PENDING", createdAt: { lt: ago(p.unconfirmed_subscriber_days) } },
      })
    ).count,
    webhookEvents: (
      await db.webhookEvent.deleteMany({ where: { receivedAt: { lt: ago(p.webhook_event_days) } } })
    ).count,
    auditLog: (
      await db.auditLog.deleteMany({ where: { createdAt: { lt: ago(p.audit_log_days) } } })
    ).count,
  };
  await db.appSetting.upsert({
    where: { key: PURGE_KEY },
    create: { key: PURGE_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  });
  logger.info("privacy.purged", results);
  return results;
}

const PURGE_KEY = "privacy.purgedAt";

/** Once a day: true when the last clean-up is older than ~20 hours. */
export async function purgeIsDue(now = new Date()) {
  const row = await db.appSetting.findUnique({ where: { key: PURGE_KEY } });
  const last = typeof row?.value === "string" ? Date.parse(row.value) : NaN;
  return !Number.isFinite(last) || now.getTime() - last > 20 * 3_600_000;
}
