import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, PackageCheck, RotateCcw, ShieldCheck } from "lucide-react";
import { ProductImage } from "@/components/catalog/product-image";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { getCategories, getFeaturedProducts } from "@/services/catalog.service";

const TRUST = [
  {
    icon: BadgeCheck,
    title: "BIS hallmarked gold",
    text: "Every gold piece carries its hallmark and HUID.",
  },
  {
    icon: PackageCheck,
    title: "Insured delivery",
    text: "Tamper-proof packing, insured until it's in your hands.",
  },
  {
    icon: RotateCcw,
    title: "7-day returns",
    text: "Changed your mind? Return eligible pieces within a week.",
  },
  {
    icon: ShieldCheck,
    title: "Secure payments",
    text: "UPI, cards and netbanking through Razorpay.",
  },
];

export default async function HomePage() {
  const [categories, featured] = await Promise.all([getCategories(), getFeaturedProducts(8)]);

  return (
    <div>
      {/* Hero: velvet band, headline left, kundan necklace framed in a jharokha arch */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div className="max-w-xl">
            <h1 className="text-4xl leading-[1.1] md:text-6xl">Jewellery made to be handed down</h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-[#ead9dd]">
              Temple, kundan and diamond pieces in hallmarked gold and sterling silver. Bought
              online, delivered insured, kept for generations.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="text-primary bg-[#fbf7f4] hover:bg-white">
                <Link href="/products">Browse jewellery</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-[#c9a45c] bg-transparent text-[#fbf7f4] hover:bg-white/10 hover:text-white"
              >
                <Link href="/products?category=necklaces-pendants">See bridal necklaces</Link>
              </Button>
            </div>
          </div>
          <div className="arch relative mx-auto aspect-[4/5] w-full max-w-sm border border-[#c9a45c]/60 bg-black">
            <Image
              src="/images/editorial/kundan-necklace.jpg"
              alt="Kundan necklace with matching jhumka earrings"
              fill
              priority
              sizes="(min-width: 768px) 384px, 90vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {/* Categories as a row of arches */}
        {categories.length > 0 && (
          <section aria-labelledby="categories-heading" className="py-16">
            <h2 id="categories-heading" className="text-3xl">
              Shop by category
            </h2>
            <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/collections/${category.slug}`}
                    className="group focus-visible:ring-ring block rounded-md outline-none focus-visible:ring-2"
                  >
                    <div className="arch border-border bg-muted border">
                      <ProductImage
                        src={category.image}
                        alt=""
                        className="transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
                      />
                    </div>
                    <span
                      className="mt-3 block text-center text-lg"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {category.name}
                    </span>
                    <span className="text-muted-foreground block text-center text-xs">
                      {category.productCount} pieces
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Editorial: bridal + festive */}
        <section aria-label="Collections" className="grid gap-5 md:grid-cols-2">
          <Link
            href="/products?category=necklaces-pendants"
            className="group relative block overflow-hidden rounded-md bg-black"
          >
            <Image
              src="/images/editorial/bridal-set.jpg"
              alt="Gold bridal necklace and earrings on red silk"
              width={714}
              height={420}
              className="aspect-[4/3] w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-6 text-white">
              <p className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                For the wedding
              </p>
              <p className="mt-1 text-sm text-white/85">
                Necklace sets, mangalsutras and temple jewellery
              </p>
            </div>
          </Link>
          <Link
            href="/products?category=bangles-bracelets"
            className="group relative block overflow-hidden rounded-md bg-[#8c8c8c]"
          >
            <Image
              src="/images/editorial/bangles.jpg"
              alt="A pair of kundan bangles with ruby and green stones"
              width={742}
              height={497}
              className="aspect-[4/3] w-full object-cover opacity-95 transition-opacity group-hover:opacity-100"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-white">
              <p className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
                For every festival
              </p>
              <p className="mt-1 text-sm text-white/85">Kundan bangles, kadas and bracelets</p>
            </div>
          </Link>
        </section>

        {featured.length > 0 && (
          <section aria-labelledby="featured-heading" className="py-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="featured-heading" className="text-3xl">
                Featured pieces
              </h2>
              <Link href="/products" className="text-sm underline underline-offset-4">
                View all jewellery
              </Link>
            </div>
            <div className="mt-8">
              <ProductGrid products={featured} />
            </div>
          </section>
        )}
      </div>

      {/* Why buy here */}
      <section aria-labelledby="trust-heading" className="border-border bg-accent border-y">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 id="trust-heading" className="sr-only">
            Why buy from us
          </h2>
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className="text-gold mt-0.5 size-6 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Diamonds band */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-8 overflow-hidden rounded-md bg-[#f1e9e6] md:grid-cols-2">
          <Image
            src="/images/editorial/solitaire-rings.jpg"
            alt="Two diamond solitaire rings"
            width={712}
            height={260}
            className="h-full min-h-56 w-full object-cover"
          />
          <div className="p-8 md:pr-12">
            <h2 className="text-3xl">Solitaires that say it simply</h2>
            <p className="text-muted-foreground mt-3 max-w-md">
              Lab-grown and natural diamonds set in 18K white, yellow and rose gold. Every stone
              comes with its certificate.
            </p>
            <Button asChild className="mt-6">
              <Link href="/products?category=rings">Shop rings</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
