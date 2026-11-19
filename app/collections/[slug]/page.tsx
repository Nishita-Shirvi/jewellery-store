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
import { PageHeader } from "@/components/layout/page-header";

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
    <div>
      <PageHeader
        title={category.name}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/products", label: "Jewellery" },
        ]}
        description={INTRO[slug] || undefined}
      >
        <p className="text-muted-foreground text-sm">{result.total} pieces</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/products?category=${slug}`}>Filter and sort</Link>
        </Button>
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-10">
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
    <div>
      {c.isPreview && (
        <p
          role="status"
          className="mx-auto mt-6 max-w-6xl rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Preview — customers can&apos;t see this collection yet (it&apos;s a draft or scheduled).
        </p>
      )}
      <PageHeader
        title={c.title}
        eyebrow="Collection"
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/products", label: "Jewellery" },
        ]}
        description={
          c.description ? <Markdown source={c.description} className="space-y-3" /> : undefined
        }
      >
        <p className="text-muted-foreground text-sm">{result.total} pieces</p>
      </PageHeader>
      <div className="mx-auto max-w-6xl px-4 py-10">
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
