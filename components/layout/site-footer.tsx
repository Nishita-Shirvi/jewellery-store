import Link from "next/link";
import { publicEnv } from "@/lib/env";

// Policy pages are created in Phase 8 (real text needed — see Docs/blocker.md B-04).
const policyLinks = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds and cancellations" },
  { href: "/shipping-policy", label: "Shipping" },
  { href: "/contact", label: "Contact" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border mt-auto border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between">
        <p>
          © {year} {publicEnv.NEXT_PUBLIC_SITE_NAME}
        </p>
        <nav aria-label="Store policies">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {policyLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-foreground hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
