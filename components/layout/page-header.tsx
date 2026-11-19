import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The band every inner page starts with (design D-89): pearl → mist wash, a carved display
 * heading, and a small gold kundan ornament. Keeps the storefront feeling like one jewellery
 * box from the home page to checkout.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  crumbs,
  children,
  className,
}: {
  title: ReactNode;
  /** Small gold label above the title (e.g. "Step 2 of 2"). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Breadcrumb trail; the current page is not included. */
  crumbs?: { href: string; label: string }[];
  /** Right-hand side: counts, actions. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "border-border border-b bg-gradient-to-b from-[#f6eee9] to-[var(--background)]",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-7 md:pt-10">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((c) => (
                <li key={c.href} className="flex items-center gap-1.5">
                  <Link
                    href={c.href}
                    className="hover:text-foreground underline-offset-4 hover:underline"
                  >
                    {c.label}
                  </Link>
                  <span aria-hidden="true" className="text-[#c9a45c]">
                    /
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-[#7d5512] uppercase">
                {eyebrow}
              </p>
            )}
            <h1 className="text-3xl leading-tight md:text-5xl">{title}</h1>
            <Ornament className="mt-3" />
            {description && (
              <div className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                {description}
              </div>
            )}
          </div>
          {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
        </div>
      </div>
    </header>
  );
}

/** A thin gold rule with a kundan-style stone in the middle. Decorative only. */
export function Ornament({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 12"
      className={cn("h-3 w-28 text-[#c9a45c]", className)}
      fill="none"
    >
      <path d="M0 6h48M72 6h48" stroke="currentColor" strokeWidth="1" />
      <path d="M60 1 66 6 60 11 54 6Z" fill="currentColor" />
      <circle cx="49.5" cy="6" r="1.5" fill="currentColor" />
      <circle cx="70.5" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}
