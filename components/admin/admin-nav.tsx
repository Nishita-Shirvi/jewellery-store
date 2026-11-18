"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/returns", label: "Returns" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/rates", label: "Gold rates" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/visits", label: "Visits" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Activity log" },
];

export function AdminNav({ visitsEnabled = true }: { visitsEnabled?: boolean }) {
  const pathname = usePathname();
  const links = visitsEnabled ? LINKS : LINKS.filter((l) => l.href !== "/admin/visits");
  return (
    <nav aria-label="Admin" className="border-border flex gap-1 overflow-x-auto border-b">
      {links.map((link) => {
        const active =
          link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              active
                ? "border-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
