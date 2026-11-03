import { config } from "@/lib/config";
import { campaignStats } from "@/services/marketing.service";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: number | string;
  testId?: string;
}) {
  return (
    <div className="border-border rounded-md border p-4">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-xl font-semibold" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export default async function AdminMarketingPage() {
  const s = await campaignStats(30);
  const m = config.marketing;
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const sent = s.cartReminders.first + s.cartReminders.second;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Last {s.days} days. Settings are in <code>config.ini</code> → <code>[marketing]</code>.
          Every marketing email has an unsubscribe link, and unsubscribed people get no newsletter
          or cart reminders.
        </p>
      </div>

      <section aria-labelledby="news-h" className="space-y-3">
        <h2 id="news-h" className="text-lg font-medium">
          Newsletter
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Subscribed (confirmed)"
            value={s.newsletter.subscribed}
            testId="stat-subscribed"
          />
          <Stat label="Waiting to confirm" value={s.newsletter.pending} />
          <Stat label="Unsubscribed" value={s.newsletter.unsubscribed} testId="stat-unsubscribed" />
        </dl>
      </section>

      <section aria-labelledby="cart-h" className="space-y-3">
        <h2 id="cart-h" className="text-lg font-medium">
          Cart reminders{" "}
          <span className="text-muted-foreground text-sm font-normal">
            (
            {m.abandoned_cart
              ? `after ${m.abandoned_first_minutes} min and ${m.abandoned_second_hours} h`
              : "off"}
            )
          </span>
        </h2>
        <dl className="grid gap-4 sm:grid-cols-4">
          <Stat label="First reminders" value={s.cartReminders.first} testId="stat-reminder-1" />
          <Stat label="Second reminders" value={s.cartReminders.second} />
          <Stat
            label="Ordered within 7 days"
            value={`${s.cartReminders.recovered} (${rate(s.cartReminders.recovered, sent)})`}
          />
          <Stat
            label="Reminder coupons used"
            value={`${s.cartReminders.couponsUsed} / ${s.cartReminders.couponsIssued}`}
          />
        </dl>
      </section>

      <section aria-labelledby="bis-h" className="space-y-3">
        <h2 id="bis-h" className="text-lg font-medium">
          Back in stock
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Stat label="Waiting for stock" value={s.backInStock.waiting} />
          <Stat label="Emails sent" value={s.backInStock.sent} />
        </dl>
      </section>

      <section aria-labelledby="ref-h" className="space-y-3">
        <h2 id="ref-h" className="text-lg font-medium">
          Referrals{" "}
          <span className="text-muted-foreground text-sm font-normal">
            ({m.referral_reward_rupees ? `₹${m.referral_reward_rupees} reward` : "off"})
          </span>
        </h2>
        <dl className="grid gap-4 sm:grid-cols-4">
          <Stat label="Friends signed up, waiting" value={s.referrals.pending} />
          <Stat label="Rewarded" value={s.referrals.rewarded} />
          <Stat label="Voided (self-referral)" value={s.referrals.voided} />
          <Stat label="Reward coupons used" value={s.referrals.couponsUsed} />
        </dl>
      </section>
    </div>
  );
}
