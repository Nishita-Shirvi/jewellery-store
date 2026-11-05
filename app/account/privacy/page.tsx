import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsToggle, DeleteAccountForm } from "@/components/account/privacy-forms";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { formatIst } from "@/lib/merch";
import { getConsents } from "@/services/privacy.service";
import { setConsentAction } from "./actions";

export const metadata: Metadata = { title: "Privacy", robots: { index: false } };
export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  email_marketing: "Offers and cart reminders by email",
  sms_updates: "Order updates by SMS",
  analytics: "Analytics cookies",
};
const SOURCE_LABEL: Record<string, string> = {
  register: "when signing up",
  account: "on this page",
  cookie_banner: "cookie banner",
  unsubscribe_link: "unsubscribe link",
  account_deleted: "account deleted",
};

function Toggle({ channel, on }: { channel: string; on: boolean }) {
  return (
    <form action={setConsentAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="granted" value={on ? "false" : "true"} />
      <span className="text-sm" data-testid={`consent-${channel}`}>
        {on ? "On" : "Off"}
      </span>
      <Button type="submit" size="sm" variant="outline">
        {on ? "Turn off" : "Turn on"}
      </Button>
    </form>
  );
}

/** Account → Privacy (Phase 27): consents, download my data, delete my account. */
export default async function PrivacyPage() {
  const user = await requireUserPage("/account/privacy");
  const [consents, account] = await Promise.all([
    getConsents(user.id),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } }),
  ]);

  return (
    <div className="max-w-3xl space-y-10">
      <h1 className="text-2xl">Privacy</h1>

      <section aria-labelledby="consent-h" className="space-y-4">
        <h2 id="consent-h" className="text-lg font-medium">
          What you allow
        </h2>
        <ul className="divide-border divide-y rounded-md border">
          <li className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{CHANNEL_LABEL.email_marketing}</p>
              <p className="text-muted-foreground text-sm">
                New collections, offers and a reminder if you leave something in your cart. Order
                emails (confirmation, shipping, invoices) are always sent.
              </p>
            </div>
            <Toggle channel="email_marketing" on={consents.emailMarketingConsent} />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{CHANNEL_LABEL.sms_updates}</p>
              <p className="text-muted-foreground text-sm">
                Shipped / delivered messages. One-time codes for cash on delivery are always sent.
              </p>
            </div>
            <Toggle channel="sms_updates" on={consents.smsUpdatesConsent} />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{CHANNEL_LABEL.analytics}</p>
              <p className="text-muted-foreground text-sm">
                Helps us see which pieces people like (Google Analytics, no advertising). Stored in
                this browser.
              </p>
            </div>
            <AnalyticsToggle />
          </li>
        </ul>
        {consents.history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer underline">History of your choices</summary>
            <ul className="mt-2 space-y-1">
              {consents.history.map((h, i) => (
                <li key={i} className="text-muted-foreground">
                  {formatIst(h.createdAt)} — {CHANNEL_LABEL[h.channel] ?? h.channel}:{" "}
                  {h.granted ? "on" : "off"} ({SOURCE_LABEL[h.source] ?? h.source})
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="export-h" className="space-y-3">
        <h2 id="export-h" className="text-lg font-medium">
          Download your data
        </h2>
        <p className="text-muted-foreground text-sm">
          A file with your account, addresses, orders, reviews, wishlist, support messages and
          consent history.
        </p>
        <Button asChild variant="outline">
          <a href="/api/account/export" download>
            Download my data
          </a>
        </Button>
      </section>

      <section aria-labelledby="delete-h" className="space-y-3">
        <h2 id="delete-h" className="text-lg font-medium">
          Delete your account
        </h2>
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          <li>
            Your name, email, addresses, wishlist, cart, saved preferences and support messages are
            deleted, and you&apos;re signed out everywhere.
          </li>
          <li>
            Orders and invoices are kept, as tax law requires (with the delivery address, stored
            encrypted). Your reviews stay, shown as &ldquo;Former customer&rdquo;.
          </li>
          <li>
            Orders still in progress need to be delivered, cancelled or refunded first. This
            can&apos;t be undone. Questions?{" "}
            <Link href="/contact" className="underline">
              Contact us
            </Link>
            .
          </li>
        </ul>
        <DeleteAccountForm hasPassword={Boolean(account.passwordHash)} />
      </section>
    </div>
  );
}
