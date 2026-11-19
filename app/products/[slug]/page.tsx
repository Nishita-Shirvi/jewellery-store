import { Price } from "@/components/catalog/price";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CalendarDays, MessageCircle } from "lucide-react";
import { config } from "@/lib/config";
import { formatINR } from "@/lib/format";
import { formatRate } from "@/lib/gst";
import { priceBreakup } from "@/lib/metal-pricing";
import { occasionLabel } from "@/lib/storefront";
import { whatsappLink } from "@/lib/support";
import { ProductMedia } from "@/components/catalog/product-media";
import { Button } from "@/components/ui/button";
import { getCurrentRates } from "@/services/metal-rate.service";
import { whatsappNumber } from "@/services/storefront.service";
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
import { formatWeight } from "@/lib/format";
import { colourLabel, metalLabel, purityLabel, stockStatus } from "@/lib/jewellery";
import { cn } from "@/lib/utils";
import { findRenamedProductSlug, getProductBySlug } from "@/services/catalog.service";
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
  if (!product) {
    // Renamed piece: send old links (and Google) to the new address.
    const renamed = await findRenamedProductSlug(slug);
    if (renamed) permanentRedirect(`/products/${renamed}`);
    notFound();
  }
  const [viewer, rates, whatsappTo] = await Promise.all([
    getCurrentUser(),
    product.pricingMode === "RATE_LINKED" ? getCurrentRates() : Promise.resolve(null),
    whatsappNumber(),
  ]);
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
  // Rate-linked price breakup (single-variant pieces). Shown only when it adds up to the price
  // actually charged, so the page never shows two different totals.
  const rate = rates?.[product.purity];
  const computed =
    rate && base && !hasOptions
      ? priceBreakup({
          ratePerGramInPaise: rate.ratePerGramInPaise,
          netWeightMg: base.netWeightMg,
          makingChargeInPaise: product.makingChargeInPaise,
          stoneChargeInPaise: product.stoneChargeInPaise,
          gstRateBps: product.gstRateBps,
        })
      : null;
  const breakup = computed && base && computed.priceInPaise === base.priceInPaise ? computed : null;
  const productUrl = new URL(`/products/${product.slug}`, publicEnv.NEXT_PUBLIC_APP_URL).toString();
  const whatsapp = whatsappLink(
    whatsappTo,
    `Hello, I'd like to know more about ${product.name} (${productUrl})`,
  );
  if (!hasOptions) {
    details.push(["Net weight", formatWeight(product.netWeightMg)]);
    if (product.grossWeightMg) details.push(["Gross weight", formatWeight(product.grossWeightMg)]);
  }
  if (product.gemstone) details.push(["Stones", product.gemstone]);
  if (product.huid) details.push(["BIS hallmark (HUID)", product.huid]);
  details.push(["Country of origin", product.countryOfOrigin]);
  details.push([
    "Returns",
    product.isReturnable && config.returns.window_days > 0
      ? `Returnable within ${config.returns.window_days} days of delivery`
      : "Not returnable",
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
        <ProductMedia
          name={product.name}
          images={product.images.length ? product.images : [product.image]}
          spinVideoUrl={product.spinVideoUrl}
        />

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
              {breakup && rate && base && (
                <details className="mt-3 text-sm">
                  <summary className="text-muted-foreground cursor-pointer text-xs underline underline-offset-4">
                    Price breakup (today&apos;s {purityLabel[product.purity]} rate{" "}
                    {formatINR(rate.ratePerGramInPaise)}/g)
                  </summary>
                  <dl className="border-border mt-2 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 rounded-md border p-3 text-xs">
                    <dt>Metal ({formatWeight(base.netWeightMg)})</dt>
                    <dd className="text-right">{formatINR(breakup.metalValueInPaise)}</dd>
                    {breakup.makingChargeInPaise > 0 && (
                      <>
                        <dt>Making charge</dt>
                        <dd className="text-right">{formatINR(breakup.makingChargeInPaise)}</dd>
                      </>
                    )}
                    {breakup.stoneChargeInPaise > 0 && (
                      <>
                        <dt>Stones</dt>
                        <dd className="text-right">{formatINR(breakup.stoneChargeInPaise)}</dd>
                      </>
                    )}
                    <dt>GST ({formatRate(product.gstRateBps)}, incl. rounding)</dt>
                    <dd className="text-right">{formatINR(breakup.gstInPaise)}</dd>
                    <dt className="font-semibold">Total</dt>
                    <dd className="text-right font-semibold">{formatINR(breakup.priceInPaise)}</dd>
                  </dl>
                </details>
              )}
              <p className={cn("mt-3 text-sm font-medium", toneClass[stock.tone])}>{stock.label}</p>

              <div className="mt-6">
                <AddToCart
                  productId={product.id}
                  variantId={base?.id}
                  stock={base ? base.available : 0}
                  priceInPaise={product.priceInPaise}
                />
                {base && base.available === 0 && (
                  <div className="mt-4">
                    <NotifyMe variantId={base.id} email={viewer?.email} />
                  </div>
                )}
              </div>
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <WishlistButton productId={product.id} slug={product.slug} initial={saved} />
            {whatsapp && (
              <Button asChild variant="outline" size="sm">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden="true" /> Ask on WhatsApp
                </a>
              </Button>
            )}
            {config.features.visit_booking && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/visit?product=${product.slug}`}>
                  <CalendarDays aria-hidden="true" /> See it in the showroom
                </Link>
              </Button>
            )}
          </div>
          {hasOptions && (
            <p className="mt-3 text-sm">
              <Link href="/size-guide" className="underline underline-offset-4">
                Size guide
              </Link>
            </p>
          )}
          {product.occasions.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Perfect for">
              {product.occasions.map((o) => (
                <li key={o}>
                  <Link
                    href={`/products?occasion=${o}`}
                    className="border-border hover:border-primary rounded-full border px-3 py-1 text-xs"
                  >
                    {occasionLabel(o)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
