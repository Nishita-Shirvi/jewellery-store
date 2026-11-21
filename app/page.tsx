import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  IndianRupee,
  MessageCircle,
  RotateCcw,
  Truck,
} from "lucide-react";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Stars } from "@/components/reviews/stars";
import { config } from "@/lib/config";
import { OCCASIONS, type OccasionTag } from "@/lib/storefront";
import { whatsappLink } from "@/lib/support";
import { getCategories, getFeaturedProducts } from "@/services/catalog.service";
import { getHomeReviews } from "@/services/review.service";
import { HomeSections } from "@/components/merch/home-sections";
import { getLiveHomeSections } from "@/services/merch.service";
import { checkPreviewToken } from "@/lib/preview";
import { themeCss } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { CategoryTiles } from "@/components/home/category-tiles";
import { Emphasised, ThemeHero } from "@/components/home/theme-hero";
import { getAppearanceSafe, getLiveTheme } from "@/services/appearance.service";
import { whatsappNumber } from "@/services/storefront.service";
import { RecoRow } from "@/components/reco/reco-row";

const OCCASION_TEXT: Record<OccasionTag, string> = {
  bridal: "Sets, chokers and mangalsutras for the big day",
  festive: "Jhumkas, kadas and temple pieces",
  "daily-wear": "Light chains, studs and everyday rings",
  "office-wear": "Quiet, polished pieces for work",
  gift: "For birthdays, anniversaries and new arrivals",
  party: "Statement earrings and cocktail rings",
};

const TRUST = [
  { icon: BadgeCheck, text: "BIS hallmarked gold" },
  { icon: IndianRupee, text: "Priced at today's gold rate" },
  { icon: Truck, text: "Insured, tracked delivery" },
  { icon: RotateCcw, text: "Easy returns" },
];

const EDITS = [
  {
    href: "/products?occasion=bridal",
    image: "/images/editorial/bridal-set.jpg",
    alt: "Gold bridal necklace and earrings on red silk",
    eyebrow: "The wedding edit",
    title: "For all your *forevers.*",
    link: "Explore bridal",
  },
  {
    href: "/products?occasion=festive",
    image: "/images/editorial/bangles.jpg",
    alt: "A pair of kundan bangles with ruby and green stones",
    eyebrow: "The festive edit",
    title: "Little luxuries. *Entirely yours.*",
    link: "Discover festive pieces",
  },
];

const eyebrow = "text-eyebrow block text-[11px] font-bold tracking-[0.2em] uppercase";
const sectionTitle = "text-head mt-2.5 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05]";
const btn =
  "inline-flex items-center gap-2.5 border px-5 py-4 text-[11.5px] font-bold tracking-[0.15em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 [&_svg]:size-4";

function SectionHead({
  id,
  kicker,
  title,
  children,
  link,
}: {
  id: string;
  kicker: string;
  title: string;
  children?: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
      <div>
        <span className={eyebrow}>{kicker}</span>
        <h2 id={id} className={sectionTitle}>
          <Emphasised text={title} emClass="text-em" />
        </h2>
        {children}
      </div>
      {link && (
        <Link
          href={link.href}
          className="text-eyebrow inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-wide underline-offset-4 hover:underline"
        >
          {link.label} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

/**
 * Home: the live festival theme's hero (Admin → Appearance) on top, then the sections built in
 * Admin → Content when any are live (Phase 24), otherwise the built-in homepage below. A Content
 * hero section, when there is one, replaces the theme hero. A content problem never takes the
 * homepage down.
 *
 * Staff can preview a theme before its dates with a signed link from Admin → Appearance
 * (?theme=<id>&preview=<token>): its colours and hero show on this page only.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; theme?: string }>;
}) {
  const params = await searchParams;
  const previewTheme =
    params.theme && checkPreviewToken("theme", params.theme, params.preview)
      ? (await getAppearanceSafe()).themes.find((t) => t.id === params.theme)
      : undefined;
  const preview = !previewTheme && checkPreviewToken("home", "home", params.preview);
  const [sections, liveTheme] = await Promise.all([
    getLiveHomeSections(new Date(), { preview }).catch(() => []),
    getLiveTheme(),
  ]);
  const theme = previewTheme ?? liveTheme;
  const contentHero = sections.some((s) => s.kind === "HERO");
  return (
    <>
      {previewTheme && (
        <>
          <style
            dangerouslySetInnerHTML={{
              // The previewed theme's colours and decoration replace today's on this page.
              __html:
                themeCss(previewTheme.colors) +
                `html[data-area="shop"] .vj-toran{display:${previewTheme.decor === "toran" ? "block" : "none"}}`,
            }}
          />
          <p role="status" className="bg-amber-50 p-3 text-center text-sm text-amber-900">
            Preview of the &ldquo;{previewTheme.name}&rdquo; theme (colours and the top of this
            page). Customers see it{" "}
            {previewTheme.isDefault
              ? "when no festival theme is live"
              : `from ${previewTheme.from} to ${previewTheme.until}`}
            .
          </p>
        </>
      )}
      {preview && (
        <p role="status" className="bg-amber-50 p-3 text-center text-sm text-amber-900">
          Homepage preview — showing drafts and scheduled sections too. Customers see only
          what&apos;s live.
        </p>
      )}
      {!contentHero && <ThemeHero theme={theme} />}
      {sections.length > 0 ? (
        <HomeSections sections={sections} hasPageHeading={!contentHero} />
      ) : (
        <DefaultHome />
      )}
    </>
  );
}

async function DefaultHome() {
  const [categories, featured, reviews, whatsapp] = await Promise.all([
    getCategories(),
    getFeaturedProducts(config.storefront.featured_count),
    getHomeReviews(config.storefront.home_reviews),
    whatsappNumber().catch(() => ""),
  ]);
  const chat = whatsapp
    ? whatsappLink(whatsapp, "Hello! I'd like to see some pieces at the showroom.")
    : null;

  return (
    <div>
      {/* Why buy here */}
      <section aria-label="Why buy from us" className="bg-deep text-on border-gilt/40 border-y">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-4 px-4 py-5 text-xs sm:text-[13.5px] lg:grid-cols-4">
          {TRUST.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 lg:justify-center">
              <Icon className="text-goldlight size-5 shrink-0" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </section>

      {categories.length > 0 && (
        <section
          aria-labelledby="categories-heading"
          className="mx-auto max-w-7xl px-4 py-14 md:py-[72px]"
        >
          <SectionHead
            id="categories-heading"
            kicker="Gold, in every expression"
            title="Find your kind of *beautiful.*"
            link={{ href: "/products", label: "All jewellery" }}
          >
            <p className="text-muted-foreground mt-2.5 text-sm">
              Each piece is shown on our display model.{" "}
              <span className="pointer-coarse:hidden">Hover</span>
              <span className="hidden pointer-coarse:inline">Tap</span> to see it up close.
            </p>
          </SectionHead>
          <CategoryTiles categories={categories} />
        </section>
      )}

      {/* Shop by occasion: two big edits, then every occasion */}
      <section aria-labelledby="occasion-heading" className="bg-alt">
        <div className="mx-auto max-w-7xl px-4 py-14 md:py-[72px]">
          <SectionHead
            id="occasion-heading"
            kicker="For every version of you"
            title="A moment. A mood. *A memory.*"
          >
            <p className="text-muted-foreground mt-2.5 text-sm">
              Shop by occasion: bridal, festive, daily wear and more.
            </p>
          </SectionHead>
          <div className="grid gap-5 md:grid-cols-[1.15fr_1fr] md:gap-6">
            {EDITS.map((e, i) => (
              <Link
                key={e.href}
                href={e.href}
                className="group bg-deep focus-visible:ring-gilt relative block min-h-[380px] overflow-hidden outline-none focus-visible:ring-2 md:min-h-[440px]"
              >
                <Image
                  src={e.image}
                  alt={e.alt}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover transition-transform duration-1000 group-hover:scale-[1.04] motion-reduce:transition-none"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-[linear-gradient(0deg,rgba(30,8,16,.92)_0%,rgba(30,8,16,.72)_42%,rgba(30,8,16,.1)_85%)]"
                />
                <div className="absolute inset-x-6 bottom-7 text-[#fbf6ee] sm:inset-x-8 sm:bottom-9">
                  <span className="text-goldlight block text-[10px] font-bold tracking-[0.2em] uppercase">
                    {e.eyebrow}
                  </span>
                  <p
                    className={cn(
                      "mt-4 mb-5 leading-[1.02]",
                      i === 0 ? "text-[40px] sm:text-[52px]" : "text-[40px] sm:text-[46px]",
                    )}
                    style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
                  >
                    <Emphasised text={e.title} emClass="text-goldlight" />
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
                    {e.link} <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
            {OCCASIONS.map((o) => (
              <li key={o.tag}>
                <Link
                  href={`/products?occasion=${o.tag}`}
                  className="group border-line hover:border-gilt bg-card block h-full border p-4 transition-colors sm:p-5"
                >
                  <span
                    className="text-head block text-xl"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
                  >
                    {o.label}
                  </span>
                  <span className="text-muted-foreground mt-1 block text-sm">
                    {OCCASION_TEXT[o.tag]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {featured.length > 0 && (
        <section
          aria-labelledby="featured-heading"
          className="mx-auto max-w-7xl px-4 py-14 md:py-[72px]"
        >
          <SectionHead
            id="featured-heading"
            kicker="The considered edit"
            title="Featured pieces"
            link={{ href: "/products", label: "View all jewellery" }}
          />
          <ProductGrid products={featured} />
        </section>
      )}
      <div className="mx-auto max-w-7xl px-4">
        <RecoRow widget="trending" query="w=trending" />
      </div>

      {/* The art of craftsmanship: style advisor, or diamonds when the advisor is off */}
      <section className="bg-brand text-on grid md:grid-cols-2">
        <Image
          src="/images/editorial/solitaire-rings.jpg"
          alt="Two diamond solitaire rings"
          width={712}
          height={260}
          className="h-full max-h-[320px] w-full object-cover md:max-h-[560px]"
        />
        <div className="self-center px-4 py-12 sm:px-10 md:py-16 lg:px-16">
          <span className="text-goldlight block text-[11px] font-bold tracking-[0.2em] uppercase">
            The art of craftsmanship
          </span>
          {config.features.style_advisor ? (
            <>
              <h2 className="mt-2.5 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05] text-[#fbf6ee]">
                A little tradition.{" "}
                <em className="text-goldlight font-normal">Entirely your own.</em>
              </h2>
              <p className="mt-4 max-w-[42ch] text-[17px] leading-[1.75] opacity-95">
                Answer a few quick questions and the style advisor suggests pieces for your look,
                occasion and budget.
              </p>
              <div className="mt-7">
                <Link href="/style-advisor" className={cn(btn, "bg-btn2 text-btn2fg border-btn2")}>
                  Find your personal edit <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-2.5 text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.05] text-[#fbf6ee]">
                Solitaires that say it <em className="text-goldlight font-normal">simply.</em>
              </h2>
              <p className="mt-4 max-w-[42ch] text-[17px] leading-[1.75] opacity-95">
                Lab-grown and natural diamonds set in 18K white, yellow and rose gold. Every stone
                comes with its certificate.
              </p>
              <div className="mt-7">
                <Link
                  href="/products?category=rings"
                  className={cn(btn, "bg-btn2 text-btn2fg border-btn2")}
                >
                  Shop rings <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {reviews.length > 0 && (
        <section
          aria-labelledby="reviews-heading"
          className="mx-auto max-w-7xl px-4 py-14 md:py-[72px]"
        >
          <SectionHead
            id="reviews-heading"
            kicker="In their words"
            title="What our customers *say*"
          />
          <ul className="grid gap-5 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id} className="bg-card border-line border p-6">
                <Stars avgX100={r.rating * 100} />
                <p
                  className="text-head mt-3 text-xl"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
                >
                  {r.title}
                </p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{r.body}</p>
                <p className="mt-4 text-xs">
                  {r.authorName} on{" "}
                  <Link href={`/products/${r.product.slug}`} className="underline">
                    {r.product.name}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {config.features.visit_booking && (
        <section className="bg-alt border-line border-t">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-7 gap-y-5 px-4 py-9">
            <div>
              <h2 className="text-head text-[clamp(1.75rem,3.4vw,2.5rem)]">
                Prefer to see it in person?
              </h2>
              <p className="text-muted-foreground mt-1">
                Book a time and we&apos;ll have your favourites ready to try. No obligation.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/visit" className={cn(btn, "bg-btn text-btnfg border-btn")}>
                <CalendarDays aria-hidden="true" /> Book a visit
              </Link>
              {chat && (
                <a
                  href={chat}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(btn, "text-eyebrow border-current bg-transparent")}
                >
                  <MessageCircle aria-hidden="true" /> Ask on WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
