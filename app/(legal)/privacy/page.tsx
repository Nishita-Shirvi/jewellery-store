import type { Metadata } from "next";
import Link from "next/link";
import { POLICY_LAST_UPDATED, getBusiness } from "@/lib/business";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy policy" };

/** Kept in step with what the system does (Phase 27): consents, retention, export, deletion. */
export default function PrivacyPage() {
  const b = getBusiness();
  const p = config.privacy;
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>
      <p>
        {b.legalName} (&quot;we&quot;) runs {b.storeName}. This policy explains what personal data
        we collect, why, how long we keep it, and your rights under India&apos;s Digital Personal
        Data Protection Act, 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          Account details: name, email address and a hashed password (or your Google sign-in).
        </li>
        <li>
          Delivery details: name, phone number and address — stored encrypted, so they can&apos;t be
          read from a copy of our database.
        </li>
        <li>Orders, reviews, wishlist, support messages, and the choices you make below.</li>
        <li>
          Payment confirmations from Razorpay. We never see or store your card, UPI PIN or bank
          details.
        </li>
        <li>
          Technical data needed to run the site securely, such as error reports and basic logs
          (email addresses and phone numbers in logs are masked).
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To process and deliver your orders and send order emails and updates.</li>
        <li>To keep your account and our store secure (for example, limiting login attempts).</li>
        <li>To meet legal duties such as tax and invoice records.</li>
        <li>
          Only if you agree: offers and cart reminders by email, and analytics cookies. Both are off
          unless you turn them on.
        </li>
      </ul>

      <h2>Your choices</h2>
      <p>
        In <Link href="/account/privacy">Account → Privacy</Link> you can turn on or off: offers and
        cart reminders by email, order updates by SMS, and analytics cookies. Every marketing email
        also has an unsubscribe link. We record each choice and when you made it.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Only the service providers we need to run the store: Razorpay (payments), our courier
        partners (delivery), Resend (emails), MSG91 (SMS), Neon and Vercel (hosting), Cloudinary
        (images) and Sentry (error tracking). We do not sell your data.
      </p>

      <h2>Cookies</h2>
      <p>
        Essential cookies keep you logged in and remember your cart and recently viewed pieces.
        Analytics cookies (Google Analytics, no advertising) are used only if you accept them.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account: until you delete it.</li>
        <li>Orders and invoices: as long as tax law requires, even after an account is deleted.</li>
        <li>
          One-time codes: {p.otp_days} days. Password reset links: {p.password_reset_days} days.
        </li>
        <li>
          Cart reminder records: {p.cart_reminder_days} days. Back-in-stock requests:{" "}
          {p.stock_alert_days} days. Unconfirmed newsletter sign-ups:{" "}
          {p.unconfirmed_subscriber_days} days.
        </li>
        <li>
          Payment and courier notifications: {p.webhook_event_days} days. Staff activity log:{" "}
          {p.audit_log_days} days.
        </li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>See your data:</strong> download it any time from{" "}
          <Link href="/account/privacy">Account → Privacy</Link>.
        </li>
        <li>
          <strong>Correct it:</strong> edit your addresses in your account, or write to us.
        </li>
        <li>
          <strong>Delete your account:</strong> from Account → Privacy. Your personal details are
          removed straight away; orders and invoices are kept for tax law; your reviews stay, shown
          as &ldquo;Former customer&rdquo;.
        </li>
        <li>
          <strong>Withdraw consent</strong> at any time, as above, and complain to the grievance
          officer below or to the Data Protection Board of India.
        </li>
      </ul>

      <h2>Grievance officer</h2>
      <p>
        {b.grievanceName} · {b.grievanceEmail}
        <br />
        {b.legalName}, {b.address}
      </p>
    </>
  );
}
