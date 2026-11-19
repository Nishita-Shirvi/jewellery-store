import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { formatINR } from "@/lib/format";
import { getReferralCode, referralLink, referralSummary } from "@/services/marketing.service";
import { Heart, LifeBuoy, MapPin, Package, Shield } from "lucide-react";

const TILES = [
  {
    href: "/account/orders",
    title: "Your orders",
    text: "Track and view past orders",
    icon: Package,
  },
  { href: "/account/wishlist", title: "Wishlist", text: "Pieces you've saved", icon: Heart },
  {
    href: "/account/addresses",
    title: "Addresses",
    text: "Manage delivery addresses",
    icon: MapPin,
  },
  { href: "/account/support", title: "Help", text: "Questions about an order", icon: LifeBuoy },
  { href: "/account/privacy", title: "Privacy", text: "Your data and choices", icon: Shield },
] as const;

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
      <h1 className="text-3xl md:text-4xl">My account</h1>
      <dl className="border-border mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border bg-white/60 p-5 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{user?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="min-w-0 break-all">{user?.email}</dd>
        <dt className="text-muted-foreground">Account type</dt>
        <dd>{user?.role === "ADMIN" ? "Admin" : "Customer"}</dd>
      </dl>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map(({ href, title, text, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group border-border hover:border-gold/60 flex h-full items-start gap-4 rounded-lg border bg-white/60 p-5 transition-colors"
            >
              <span className="bg-accent text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span>
                <span className="block text-lg" style={{ fontFamily: "var(--font-display)" }}>
                  {title}
                </span>
                <span className="text-muted-foreground block text-sm">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {referral && (
        <section
          aria-labelledby="refer-h"
          className="mt-8 max-w-xl rounded-lg border border-[#c9a45c]/50 bg-[#fbf3e6] p-5 text-sm"
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
