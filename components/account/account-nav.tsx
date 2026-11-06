"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const ACCOUNT_LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/wishlist", label: "Wishlist" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/support", label: "Support" },
  { href: "/account/privacy", label: "Privacy" },
] as const;

/** Side menu on wide screens, a scrolling row of pills on phones; marks the current page. */
export function AccountNav() {
  const path = usePathname();
  const current = (href: string) =>
    href === "/account" ? path === "/account" : path === href || path.startsWith(`${href}/`);
  return (
    <nav aria-label="Account">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-1 md:overflow-visible md:px-0">
        {ACCOUNT_LINKS.map((l) => {
          const active = current(l.href);
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-full border px-4 py-1.5 text-sm transition-colors md:rounded-md md:border-0 md:border-l-2 md:px-3 md:py-2",
                  active
                    ? "bg-primary text-primary-foreground border-primary md:border-l-[#c9a45c] md:bg-[#f3e9e4] md:text-[var(--primary)]"
                    : "border-border hover:bg-accent md:border-l-transparent",
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
