import { Price } from "@/components/catalog/price";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/cart/add-to-cart";
import { VariantPurchase } from "@/components/catalog/variant-purchase";
import { NotifyMe } from "@/components/marketing/marketing-forms";
import { PincodeChecker } from "@/components/catalog/pincode-checker";
import { WishlistButton } from "@/components/wishlist/wishlist-button";
import { ReviewSection } from "@/components/reviews/review-section";
import { Stars } from "@/components/reviews/stars";
import { REVIEW_SORTS, formatRating, type ReviewSort } from "@/lib/reviews";
import { publicEnv } from "@/lib/env";
import { TrackEvent } from "@/components/analytics/track-event";
import { getCurrentUser } from "@/lib/auth-guards";
import { isWishlisted } from "@/services/wishlist.service";
import { ProductImage } from "@/components/catalog/product-image";
import { formatWeight } from "@/lib/format";
import { colourLabel, metalLabel, purityLabel, stockStatus } from "@/lib/jewellery";
import { cn } from "@/lib/utils";
import { getProductBySlug } from "@/services/catalog.service";
import { ViewTracker } from "@/components/reco/view-tracker";
import { RecentlyViewedRow, RecoRow } from "@/components/reco/reco-row";
import { getBusiness } from "@/lib/business";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  return {
    title: product.name,
    description: `${product.materialSummary}. ${product.description}`.slice(0, 160),
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.description,
      type: "website",
    },
  };
}

const toneClass = {
  ok: "text-emerald",
  low: "text-amber-700",
  out: "text-red-700",
} as const;

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ reviews?: string; rpage?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const reviewSort: ReviewSort = REVIEW_SORTS.includes(sp.reviews as ReviewSort)
    ? (sp.reviews as ReviewSort)
    : "newest";
  const reviewPage = Math.min(Math.max(1, Number.parseInt(sp.rpage ?? "1", 10) || 1), 1000);
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const viewer = await getCurrentUser();
  const saved = viewer ? await isWishlisted(viewer.id, product.id) : false;

  const stock = stockStatus(product.stock);
  const business = getBusiness();
  const details: [string, string][] = [
    [
      "Metal",
      `${metalLabel[product.metalType]} (${colourLabel[product.metalColour].toLowerCase()})`,
    ],
    ["Purity", purityLabel[product.purity]],
  ];
  // With options (sizes…), weight differs per variant and is shown next to the picker instead.
  const hasOptions = product.options.length > 0;
  const base = product.variants[0];
  if (!hasOptions) {
    details.push(["Net weight", formatWeight(product.netWeightMg)]);
    if (product.grossWeightMg) details.push(["Gross weight", formatWeight(product.grossWeightMg)]);
  }
  if (product.gemstone) details.push(["Stones", product.gemstone]);
  if (product.huid) details.push(["BIS hallmark (HUID)", product.huid]);
  details.push(["Country of origin", product.countryOfOrigin]);
  details.push([
    "Returns",
    product.isReturnable ? "Returnable within 7 days of delivery" : "Not returnable",
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <ol className="flex flex-wrap gap-1">
          <li>
            <Link href="/products" className="hover:text-foreground hover:underline">
              Jewellery
            </Link>
            <span aria-hidden="true"> / </span>
          </li>
          <li>
            <Link
              href={`/products?category=${product.category.slug}`}
              className="hover:text-foreground hover:underline"
            >
              {product.category.name}
            </Link>
          </li>
        </ol>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <div className="space-y-3">
          <div className="border-border bg-muted overflow-hidden rounded-md border">
            <ProductImage
              src={product.images[0] ?? product.image}
              alt={product.name}
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
            />
          </div>
          {product.images.length > 1 && (
            <ul className="grid grid-cols-4 gap-2">
              {product.images.slice(1).map((src, i) => (
                <li key={src} className="border-border bg-muted overflow-hidden rounded border">
                  <ProductImage src={src} alt={`${product.name}, view ${i + 2}`} sizes="12vw" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h1 className="text-3xl leading-tight md:text-4xl">{product.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{product.materialSummary}</p>
          {product.reviewCount > 0 && (
            <a href="#reviews" className="mt-2 inline-flex items-center gap-2 text-sm">
              <Stars avgX100={product.ratingAvgX100} />
              <span className="underline underline-offset-4">
                {formatRating(product.ratingAvgX100)} ({product.reviewCount}{" "}
                {product.reviewCount === 1 ? "review" : "reviews"})
              </span>
            </a>
          )}
          {hasOptions ? (
            <div className="mt-5">
              <VariantPurchase
                productId={product.id}
                options={product.options}
                variants={product.variants}
                viewerEmail={viewer?.email}
              />
            </div>
          ) : (
            <>
              <div className="mt-5">
                <Price
                  size="lg"
                  priceInPaise={product.priceInPaise}
                  compareAtPriceInPaise={product.compareAtPriceInPaise}
                  percentOff={product.percentOff}
                />
              </div>
              <p className="text-muted-foreground text-xs">Inclusive of all taxes</p>
              <p className={cn("mt-3 text-sm font-medium", toneClass[stock.tone])}>{stock.label}</p>

              <div className="mt-6">
                <AddToCart
                  productId={product.id}
                  variantId={base?.id}
                  stock={base ? base.available : 0}
                />
                {base && base.available === 0 && (
                  <div className="mt-4">
                    <NotifyMe variantId={base.id} email={viewer?.email} />
                  </div>
                )}
              </div>
            </>
          )}
          <div className="mt-4">
            <WishlistButton productId={product.id} slug={product.slug} initial={saved} />
          </div>
          <div className="mt-6">
            <PincodeChecker />
          </div>

          <p className="mt-8 leading-relaxed">{product.description}</p>

          <h2 className="mt-8 text-sm font-semibold">Product details</h2>
          <dl className="divide-border border-border mt-3 divide-y border-y text-sm">
            {details.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[140px_1fr] gap-4 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {/* Seller details (Consumer Protection (E-Commerce) Rules, 2020; Phase 27). */}
          <section aria-labelledby="seller-h" className="mt-8 text-sm" data-testid="seller-details">
            <h2 id="seller-h" className="text-sm font-semibold">
              Sold by
            </h2>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              {business.legalName}, {business.address}
              {business.gstin ? ` · GSTIN ${business.gstin}` : ""}
            </p>
            <p className="text-muted-foreground mt-1">
              Grievance officer: {business.grievanceName} ({business.grievanceEmail}) ·{" "}
              <Link href="/refund-policy" className="underline">
                Returns and refunds
              </Link>{" "}
              ·{" "}
              <Link href="/shipping-policy" className="underline">
                Delivery
              </Link>
            </p>
            <p className="text-muted-foreground mt-1">
              Price includes all taxes (GST). Delivery charges, if any, are shown at checkout.
            </p>
          </section>
        </div>
      </div>
      <script
        type="application/ld+json"
        // Product + offer + rating data for Google rich results.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description,
            image: product.images.map((src) =>
              new URL(src, publicEnv.NEXT_PUBLIC_APP_URL).toString(),
            ),
            sku: product.slug,
            offers: {
              "@type": "Offer",
              priceCurrency: "INR",
              price: (product.priceInPaise / 100).toFixed(2),
              availability:
                product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url: new URL(`/products/${product.slug}`, publicEnv.NEXT_PUBLIC_APP_URL).toString(),
            },
            ...(product.reviewCount > 0
              ? {
                  aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: formatRating(product.ratingAvgX100),
                    reviewCount: product.reviewCount,
                    bestRating: 5,
                    worstRating: 1,
                  },
                }
              : {}),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <TrackEvent
        name="view_item"
        params={{
          currency: "INR",
          value: product.priceInPaise / 100,
          items: [
            { item_id: product.slug, item_name: product.name, price: product.priceInPaise / 100 },
          ],
        }}
      />
      {/* Recommendations (Phase 25): each streams in on its own, so the page never waits. */}
      <ViewTracker slug={product.slug} />
      <RecoRow widget="bought_together" query={`w=bought_together&id=${product.id}`} />
      <RecoRow widget="similar" query={`w=similar&id=${product.id}`} />
      <ReviewSection
        product={product}
        viewerId={viewer?.id ?? null}
        sort={reviewSort}
        page={reviewPage}
      />
      <RecentlyViewedRow excludeSlug={product.slug} />
    </div>
  );
}
