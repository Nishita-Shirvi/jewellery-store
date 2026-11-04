import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { formatINR } from "@/lib/format";
import { getReferralCode, referralLink, referralSummary } from "@/services/marketing.service";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  const reward = config.marketing.referral_reward_rupees;
  const referral =
    user && reward > 0
      ? {
          link: referralLink(await getReferralCode(user.id)),
          ...(await referralSummary(user.id)),
        }
      : null;
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
      <dl className="mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{user?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{user?.email}</dd>
        <dt className="text-muted-foreground">Account type</dt>
        <dd>{user?.role === "ADMIN" ? "Admin" : "Customer"}</dd>
      </dl>
      <ul className="mt-8 grid max-w-md gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/account/orders"
            className="border-border hover:bg-muted block rounded-md border p-4"
          >
            <span className="font-medium">Your orders</span>
            <span className="text-muted-foreground block text-xs">Track and view past orders</span>
          </Link>
        </li>
        <li>
          <Link
            href="/account/addresses"
            className="border-border hover:bg-muted block rounded-md border p-4"
          >
            <span className="font-medium">Addresses</span>
            <span className="text-muted-foreground block text-xs">Manage delivery addresses</span>
          </Link>
        </li>
      </ul>
      {referral && (
        <section
          aria-labelledby="refer-h"
          className="border-border mt-8 max-w-md rounded-md border p-4 text-sm"
        >
          <h2 id="refer-h" className="font-medium">
            Refer a friend
          </h2>
          <p className="text-muted-foreground mt-1">
            Share your link. When a friend&apos;s first order is delivered, you get{" "}
            {formatINR(reward * 100)} off your next order.
          </p>
          <p
            className="bg-muted mt-3 rounded px-3 py-2 font-mono text-xs break-all"
            data-testid="referral-link"
          >
            {referral.link}
          </p>
          <p className="text-muted-foreground mt-2 text-xs">
            {referral.pending} friend(s) signed up · {referral.rewarded} reward(s) earned
          </p>
        </section>
      )}
    </section>
  );
}
