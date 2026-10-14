import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { purityLabel } from "@/lib/jewellery";
import type { ProductListQuery } from "@/lib/validation/catalog";
import type { CategorySummary } from "@/types/catalog";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const PURITIES = ["K22", "K18", "K14", "S925"] as const;

/**
 * Plain GET form: works without JavaScript and keeps every filter in the URL,
 * so filtered pages can be shared and bookmarked.
 */
export function CatalogFilters({
  query,
  categories,
}: {
  query: ProductListQuery;
  categories: CategorySummary[];
}) {
  return (
    <form action="/products" method="get" className="space-y-4" aria-label="Filter products">
      {query.q && <input type="hidden" name="q" value={query.q} />}

      <div className="space-y-1.5">
        <Label htmlFor="filter-category">Category</Label>
        <select
          id="filter-category"
          name="category"
          defaultValue={query.category ?? ""}
          className={selectClass}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.productCount})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-metal">Metal</Label>
        <select
          id="filter-metal"
          name="metal"
          defaultValue={query.metal ?? ""}
          className={selectClass}
        >
          <option value="">Any metal</option>
          <option value="GOLD">Gold</option>
          <option value="SILVER">Silver</option>
          <option value="PLATINUM">Platinum</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-purity">Purity</Label>
        <select
          id="filter-purity"
          name="purity"
          defaultValue={query.purity ?? ""}
          className={selectClass}
        >
          <option value="">Any purity</option>
          {PURITIES.map((p) => (
            <option key={p} value={p}>
              {purityLabel[p]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Price (₹)</legend>
        <div className="flex items-center gap-2">
          <input
            aria-label="Minimum price"
            name="minPrice"
            inputMode="numeric"
            placeholder="Min"
            defaultValue={query.minPrice ?? ""}
            className={selectClass}
          />
          <span aria-hidden="true">–</span>
          <input
            aria-label="Maximum price"
            name="maxPrice"
            inputMode="numeric"
            placeholder="Max"
            defaultValue={query.maxPrice ?? ""}
            className={selectClass}
          />
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="filter-rating">Rating</Label>
        <select
          id="filter-rating"
          name="rating"
          defaultValue={query.rating ?? ""}
          className={selectClass}
        >
          <option value="">Any rating</option>
          <option value="4">4 stars and up</option>
          <option value="3">3 stars and up</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="inStock" value="1" defaultChecked={query.inStock === "1"} /> In
        stock only
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="filter-sort">Sort by</Label>
        <select
          id="filter-sort"
          name="sort"
          defaultValue={query.sort ?? (query.q ? "relevance" : "newest")}
          className={selectClass}
        >
          {query.q && <option value="relevance">Best match</option>}
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Top rated</option>
        </select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Apply
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Clear</Link>
        </Button>
      </div>
    </form>
  );
}
