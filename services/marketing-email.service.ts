import "server-only";
import { render } from "@react-email/render";
import { OrderEmail } from "@/emails/order-email";
import { getBusiness } from "@/lib/business";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { formatINR } from "@/lib/format";
import { logger } from "@/lib/logger";
import { lineName } from "@/lib/variants";
import { sendEmail } from "@/services/email.service";
import { isUnsubscribed, unsubscribeUrl } from "@/services/marketing.service";
import { config } from "@/lib/config";
import { displayTicketNumber } from "@/lib/support";

/**
 * Renders and sends marketing emails (job "email.marketing"). Every send re-checks that it's
 * still wanted: unsubscribed → skipped; cart reminder after the customer ordered or emptied the
 * cart → skipped; back-in-stock when it sold out again → skipped. Throws on send failure (retry).
 */

export type MarketingEmail =
  | { kind: "newsletter_confirm"; to: string; token: string }
  | { kind: "cart_reminder"; reminderId: string }
  | { kind: "back_in_stock"; alertId: string }
  | { kind: "referral_reward"; referralId: string }
  | { kind: "staff_invite"; inviteId: string; token: string }
  | { kind: "ticket_customer_update"; ticketId: string; messageId: string }
  | { kind: "ticket_staff_alert"; ticketId: string; messageId: string };

const excerpt = (text: string) => (text.length > 600 ? `${text.slice(0, 600)}…` : text);

const app = () => publicEnv.NEXT_PUBLIC_APP_URL;

async function send(input: {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  items?: { name: string; quantity: number; amount: string }[];
  greetingName?: string | null;
  marketing: boolean;
}) {
  const business = getBusiness();
  const unsub = input.marketing ? unsubscribeUrl(input.to) : undefined;
  const element = OrderEmail({
    storeName: publicEnv.NEXT_PUBLIC_SITE_NAME,
    preview: input.paragraphs[0] ?? input.heading,
    heading: input.heading,
    greetingName: input.greetingName,
    paragraphs: input.paragraphs,
    items: input.items,
    button: input.button,
    footer: `${business.legalName} · ${business.email} · ${business.phone}`,
    unsubscribeUrl: unsub,
  });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  await sendEmail({
    to: input.to,
    subject: input.subject,
    html,
    text: unsub ? `${text}\n\nUnsubscribe: ${unsub}` : text,
    // One-click unsubscribe in Gmail/Outlook (RFC 8058).
    headers: unsub
      ? {
          "List-Unsubscribe": `<${unsub.replace("/unsubscribe?", "/api/unsubscribe?")}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  });
}

export async function deliverMarketingEmail(email: MarketingEmail): Promise<"sent" | "skipped"> {
  switch (email.kind) {
    case "newsletter_confirm": {
      const sub = await db.subscriber.findUnique({ where: { email: email.to } });
      if (sub?.status !== "PENDING") return "skipped"; // confirmed or unsubscribed meanwhile
      await send({
        to: email.to,
        subject: "Please confirm your subscription",
        heading: "One click to confirm",
        paragraphs: [
          "Someone (hopefully you) asked to receive our news about new collections and offers.",
          "If that wasn't you, just ignore this email — you won't hear from us.",
        ],
        button: {
          label: "Confirm my subscription",
          url: `${app()}/newsletter/confirm?token=${encodeURIComponent(email.token)}`,
        },
        marketing: false,
      });
      return "sent";
    }

    case "cart_reminder": {
      const reminder = await db.cartReminder.findUnique({
        where: { id: email.reminderId },
        include: { user: { select: { email: true, name: true } } },
      });
      if (!reminder) return "skipped";
      const to = reminder.user.email;
      if (await isUnsubscribed(to)) return "skipped";
      const ordered = await db.order.count({
        where: {
          userId: reminder.userId,
          createdAt: { gt: reminder.cartVersion },
          status: { notIn: ["PENDING", "FAILED"] },
        },
      });
      const items = await db.cartItem.findMany({
        where: { cart: { userId: reminder.userId } },
        include: {
          variant: { select: { label: true, priceInPaise: true } },
          product: { select: { name: true } },
        },
        take: 5,
      });
      if (ordered > 0 || items.length === 0) return "skipped";
      const lines = items.map((i) => ({
        name: lineName(i.product.name, i.variant.label),
        quantity: i.quantity,
        amount: formatINR(i.variant.priceInPaise * i.quantity),
      }));
      await send({
        to,
        greetingName: reminder.user.name?.split(" ")[0],
        subject:
          reminder.step === 1 ? "You left something beautiful behind" : "Still thinking it over?",
        heading: reminder.step === 1 ? "Your cart is waiting" : "Your pieces are still here",
        paragraphs: [
          reminder.step === 1
            ? "The pieces you chose are still in your cart. Popular designs can sell out, so here's a quick way back."
            : "We've kept your cart for you. Every gold piece is BIS hallmarked and insured until it reaches you.",
          ...(reminder.couponCode
            ? [
                `Use code ${reminder.couponCode} at checkout for an extra discount — it's yours alone and works once, within 7 days.`,
              ]
            : []),
        ],
        items: lines,
        button: { label: "Return to my cart", url: `${app()}/cart` },
        marketing: true,
      });
      logger.info("marketing.cart_reminder_sent", { reminderId: reminder.id, step: reminder.step });
      return "sent";
    }

    case "back_in_stock": {
      const alert = await db.stockAlert.findUnique({
        where: { id: email.alertId },
        include: {
          variant: {
            select: {
              label: true,
              stock: true,
              reservedStock: true,
              isActive: true,
              priceInPaise: true,
              product: { select: { name: true, slug: true, isActive: true } },
            },
          },
        },
      });
      if (!alert) return "skipped";
      const v = alert.variant;
      if (!v.isActive || !v.product.isActive || v.stock - v.reservedStock <= 0) {
        // Sold out again before we could tell them: keep them on the list for next time.
        await db.stockAlert.update({ where: { id: alert.id }, data: { notifiedAt: null } });
        return "skipped";
      }
      const name = lineName(v.product.name, v.label);
      await send({
        to: alert.email,
        subject: `Back in stock: ${name}`,
        heading: "It's back!",
        paragraphs: [
          `${name} is available again (${formatINR(v.priceInPaise)}). Pieces like this don't stay long.`,
          "You asked us to tell you once — you won't get more emails about it.",
        ],
        button: { label: "See it now", url: `${app()}/products/${v.product.slug}` },
        marketing: false,
      });
      return "sent";
    }

    case "ticket_customer_update": {
      const message = await db.ticketMessage.findUnique({
        where: { id: email.messageId },
        include: {
          ticket: {
            select: {
              id: true,
              subject: true,
              status: true,
              user: { select: { email: true, name: true } },
            },
          },
        },
      });
      if (!message || message.internal || message.ticketId !== email.ticketId) return "skipped";
      const t = message.ticket;
      const number = displayTicketNumber(t.id);
      await send({
        to: t.user.email,
        greetingName: t.user.name?.split(" ")[0],
        subject: `${t.status === "RESOLVED" ? "Resolved" : "New reply"}: ${t.subject} (${number})`,
        heading:
          t.status === "RESOLVED" ? "We've resolved your request" : "We've replied to your request",
        paragraphs: [
          excerpt(message.body),
          t.status === "RESOLVED"
            ? "If anything is still not right, just reply on the ticket page and we'll pick it up again."
            : "You can reply on the ticket page.",
        ],
        button: { label: "View your ticket", url: `${app()}/account/support/${t.id}` },
        marketing: false,
      });
      return "sent";
    }

    case "ticket_staff_alert": {
      const message = await db.ticketMessage.findUnique({
        where: { id: email.messageId },
        include: {
          ticket: {
            select: {
              id: true,
              subject: true,
              category: true,
              user: { select: { email: true } },
              assignedTo: { select: { email: true } },
            },
          },
          attachments: { select: { id: true } },
        },
      });
      if (!message || message.ticketId !== email.ticketId) return "skipped";
      const t = message.ticket;
      const to = t.assignedTo?.email ?? config.support.notify_email ?? getBusiness().email;
      await send({
        to,
        subject: `[Support] ${t.subject} (${displayTicketNumber(t.id)})`,
        heading: `Message from ${t.user.email}`,
        paragraphs: [
          excerpt(message.body),
          ...(message.attachments.length
            ? [`${message.attachments.length} attachment(s) — open the ticket to see them.`]
            : []),
        ],
        button: { label: "Open in Admin → Support", url: `${app()}/admin/support/${t.id}` },
        marketing: false,
      });
      return "sent";
    }

    case "staff_invite": {
      const invite = await db.staffInvite.findUnique({
        where: { id: email.inviteId },
        include: { role: { select: { name: true } } },
      });
      if (!invite || invite.acceptedAt || invite.revokedAt) return "skipped";
      await send({
        to: invite.email,
        subject: `You're invited to the ${publicEnv.NEXT_PUBLIC_SITE_NAME} admin`,
        heading: "You've been invited to help run the store",
        paragraphs: [
          `You've been given the ${invite.role.name} role. Sign in (or create an account) with this email address, then accept the invitation.`,
          "You'll set up two-step sign-in with an authenticator app (Google Authenticator, Microsoft Authenticator…) the first time. The link works for 7 days.",
        ],
        button: {
          label: "Accept invitation",
          url: `${app()}/staff/invite?token=${encodeURIComponent(email.token)}`,
        },
        marketing: false,
      });
      return "sent";
    }

    case "referral_reward": {
      const referral = await db.referral.findUnique({
        where: { id: email.referralId },
        include: { referrer: { select: { email: true, name: true } } },
      });
      if (!referral?.rewardCode) return "skipped";
      const coupon = await db.coupon.findUnique({ where: { code: referral.rewardCode } });
      await send({
        to: referral.referrer.email,
        greetingName: referral.referrer.name?.split(" ")[0],
        subject: "Thank you — your referral reward is here",
        heading: "Your friend's order has arrived",
        paragraphs: [
          `As a thank-you, here is ${coupon ? formatINR(coupon.value) : "a reward"} off your next order with code ${referral.rewardCode}.`,
          coupon?.minOrderInPaise
            ? `It works once, on orders of ${formatINR(coupon.minOrderInPaise)} or more, until ${coupon.endsAt?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}.`
            : "It works once on your account.",
        ],
        button: { label: "Shop now", url: `${app()}/products` },
        marketing: false,
      });
      return "sent";
    }
  }
}
