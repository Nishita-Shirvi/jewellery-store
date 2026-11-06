import type { Metadata } from "next";
import Link from "next/link";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { Pagination } from "@/components/catalog/pagination";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { productListQuerySchema } from "@/lib/validation/catalog";
import { getCategories, listProducts } from "@/services/catalog.service";
import { PageHeader } from "@/components/layout/page-header";

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
    robots:
      query.q ||
      query.metal ||
      query.purity ||
      query.minPrice ||
      query.maxPrice ||
      query.inStock ||
      query.rating ||
      query.sort ||
      query.page > 1
        ? { index: false }
        : undefined,
    alternates: { canonical: category ? `/collections/${category.slug}` : "/products" },
  };
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = productListQuerySchema.parse(await searchParams);
  const [categories, result] = await Promise.all([getCategories(), listProducts(query)]);
  const category = categories.find((c) => c.slug === query.category);

  const heading = query.q ? `Results for “${query.q}”` : (category?.name ?? "All jewellery");

  return (
    <div>
      <PageHeader
        title={heading}
        crumbs={[{ href: "/", label: "Home" }]}
        description={
          !query.q && !category
            ? "Hallmarked gold, sterling silver and certified diamonds — every piece insured to your door."
            : undefined
        }
      >
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {result.total} {result.total === 1 ? "piece" : "pieces"}
        </p>
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-[230px_1fr]">
        <aside className="md:sticky md:top-24 md:self-start">
          <div className="border-border rounded-lg border bg-white/60 p-5">
            <h2 className="mb-4 text-lg">Refine</h2>
            <CatalogFilters query={query} categories={categories} />
          </div>
        </aside>

        <section aria-label="Products">
          {result.items.length > 0 ? (
            <>
              <ProductGrid products={result.items} />
              <Pagination query={query} pageCount={result.pageCount} />
            </>
          ) : (
            <div className="border-border flex flex-col items-center rounded-lg border border-dashed px-6 py-14 text-center">
              <div
                aria-hidden="true"
                className="arch border-border bg-muted mb-5 h-20 w-16 border"
              />
              <h2 className="text-2xl">No jewellery found</h2>
              <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                Try a different search or remove some filters — or browse everything we have.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link href="/products">See all jewellery</Link>
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
