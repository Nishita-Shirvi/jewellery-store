import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/catalog/pagination";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { productListQuerySchema } from "@/lib/validation/catalog";
import { getCategories, listProducts } from "@/services/catalog.service";

const INTRO: Record<string, string> = {
  rings:
    "Solitaires, cocktail rings and everyday bands in hallmarked gold, platinum and sterling silver.",
  "necklaces-pendants":
    "Temple necklaces, mangalsutras, pearls and pendants, from bridal statements to daily wear.",
  earrings: "Jhumkas, chandbalis, studs and hoops in gold, diamonds and silver.",
  "bangles-bracelets": "Plain and kundan bangles, kadas, tennis bracelets and charm bracelets.",
};

type Params = Promise<{ slug: string }>;

async function findCategory(slug: string) {
  return (await getCategories()).find((c) => c.slug === slug);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  if (!category) return { title: "Collection not found" };
  return {
    title: `${category.name} — hallmarked gold, silver and diamond`,
    description: INTRO[category.slug] ?? `Shop ${category.name.toLowerCase()}.`,
    alternates: { canonical: `/collections/${category.slug}` },
  };
}

/** SEO landing page per category: /collections/rings, /collections/earrings, ... */
export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) notFound();
  const query = productListQuerySchema.parse({ ...(await searchParams), category: slug });
  const result = await listProducts(query);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        /{" "}
        <Link href="/products" className="hover:underline">
          Jewellery
        </Link>
      </nav>
      <h1 className="mt-3 text-4xl md:text-5xl">{category.name}</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl">{INTRO[slug] ?? ""}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <p className="text-muted-foreground text-sm">{result.total} pieces</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/products?category=${slug}`}>Filter and sort</Link>
        </Button>
      </div>
      <div className="mt-8">
        <ProductGrid products={result.items} />
        <Pagination query={query} pageCount={result.pageCount} />
      </div>
    </div>
  );
}
