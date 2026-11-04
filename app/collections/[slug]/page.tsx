import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/catalog/pagination";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { productListQuerySchema } from "@/lib/validation/catalog";
import { getCategories, listProducts } from "@/services/catalog.service";
import { Markdown } from "@/lib/markdown";
import {
  getCollectionForPage,
  getCollectionProducts,
  type CollectionView,
} from "@/services/merch.service";

const INTRO: Record<string, string> = {
  rings:
    "Solitaires, cocktail rings and everyday bands in hallmarked gold, platinum and sterling silver.",
  "necklaces-pendants":
    "Temple necklaces, mangalsutras, pearls and pendants, from bridal statements to daily wear.",
  earrings: "Jhumkas, chandbalis, studs and hoops in gold, diamonds and silver.",
  "bangles-bracelets": "Plain and kundan bangles, kadas, tennis bracelets and charm bracelets.",
};

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | undefined>>;

async function findCategory(slug: string) {
  return (await getCategories()).find((c) => c.slug === slug);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) {
    // Merchandised collection (Phase 24): live, or a draft opened with a preview link.
    const c = await getCollectionForPage(slug, (await searchParams).preview);
    if (!c) return { title: "Collection not found" };
    return {
      title: c.seoTitle ?? c.title,
      description: c.seoDescription ?? (c.description.slice(0, 160) || `Shop ${c.title}.`),
      alternates: { canonical: `/collections/${c.slug}` },
      ...(c.isPreview ? { robots: { index: false, follow: false } } : {}),
      ...(c.image ? { openGraph: { images: [c.image] } } : {}),
    };
  }
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
  searchParams: Search;
}) {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) {
    const sp = await searchParams;
    const collection = await getCollectionForPage(slug, sp.preview);
    if (!collection) notFound();
    return (
      <MerchCollection collection={collection} page={Number(sp.page) || 1} preview={sp.preview} />
    );
  }
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

/** A merchandised collection (Phase 24): hand-picked or rule-based products. */
async function MerchCollection({
  collection: c,
  page: requested,
  preview,
}: {
  collection: CollectionView;
  page: number;
  preview?: string;
}) {
  const page = Math.min(Math.max(1, Math.floor(requested)), 1000);
  const result = await getCollectionProducts(c, page);
  const hrefFor = (p: number) => {
    const q = new URLSearchParams();
    if (p > 1) q.set("page", String(p));
    if (c.isPreview && preview) q.set("preview", preview);
    const qs = q.toString();
    return `/collections/${c.slug}${qs ? `?${qs}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {c.isPreview && (
        <p
          role="status"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Preview — customers can&apos;t see this collection yet (it&apos;s a draft or scheduled).
        </p>
      )}
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        /{" "}
        <Link href="/products" className="hover:underline">
          Jewellery
        </Link>
      </nav>
      <h1 className="mt-3 text-4xl md:text-5xl">{c.title}</h1>
      {c.description && (
        <Markdown
          source={c.description}
          className="text-muted-foreground mt-3 max-w-2xl space-y-3"
        />
      )}
      <p className="text-muted-foreground mt-6 text-sm">{result.total} pieces</p>
      <div className="mt-8">
        {result.items.length > 0 ? (
          <ProductGrid products={result.items} />
        ) : (
          <p className="text-muted-foreground">
            New pieces are on their way — please check back soon.
          </p>
        )}
        <Pagination query={{ page: result.page }} pageCount={result.pageCount} hrefFor={hrefFor} />
      </div>
    </div>
  );
}
