import Link from "next/link";
import { productsUrl } from "@/lib/catalog-url";
import { BUDGETS } from "@/lib/storefront";
import { cn } from "@/lib/utils";
import type { ProductListQuery } from "@/lib/validation/catalog";

/** One-tap budget ranges; they set the same minPrice/maxPrice as the price boxes. */
export function BudgetChips({ query }: { query: ProductListQuery }) {
  return (
    <nav aria-label="Shop by budget" className="-mx-4 mt-6 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {BUDGETS.map((b) => {
          const active = query.minPrice === b.minPrice && query.maxPrice === b.maxPrice;
          const href = productsUrl({
            ...query,
            minPrice: active ? undefined : b.minPrice,
            maxPrice: active ? undefined : b.maxPrice,
            page: 1,
          });
          return (
            <li key={b.label} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-block rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:border-primary hover:text-primary",
                )}
              >
                {b.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
