import type { Metadata } from "next";
import Link from "next/link";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { Pagination } from "@/components/catalog/pagination";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { productListQuerySchema } from "@/lib/validation/catalog";
import { getCategories, listProducts } from "@/services/catalog.service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const query = productListQuerySchema.parse(await searchParams);
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === query.category);
  const title = query.q ? `Search: ${query.q}` : category ? category.name : "All jewellery";

  return {
    title,
    description: category
      ? `Shop ${category.name.toLowerCase()} in gold, silver and diamonds.`
      : "Shop rings, necklaces, earrings, bangles and bracelets in gold, silver and diamonds.",
    // Filtered and searched pages shouldn't compete with category pages in Google.
    robots: query.q || query.metal || query.purity || query.page > 1 ? { index: false } : undefined,
    alternates: { canonical: category ? `/products?category=${category.slug}` : "/products" },
  };
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = productListQuerySchema.parse(await searchParams);
  const [categories, result] = await Promise.all([getCategories(), listProducts(query)]);
  const category = categories.find((c) => c.slug === query.category);

  const heading = query.q ? `Results for “${query.q}”` : (category?.name ?? "All jewellery");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {result.total} {result.total === 1 ? "piece" : "pieces"}
        </p>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[220px_1fr]">
        <aside>
          <CatalogFilters query={query} categories={categories} />
        </aside>

        <section aria-label="Products">
          {result.items.length > 0 ? (
            <>
              <ProductGrid products={result.items} />
              <Pagination query={query} pageCount={result.pageCount} />
            </>
          ) : (
            <div className="border-border rounded-md border border-dashed p-10 text-center">
              <h2 className="font-medium">No jewellery found</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Try a different search or remove some filters.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/products">See all jewellery</Link>
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
