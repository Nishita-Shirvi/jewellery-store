import Link from "next/link";
import { getImageProps } from "next/image";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/lib/markdown";
import type { LiveSection } from "@/services/merch.service";

/**
 * Art-directed image (Phase 24): the phone image on small screens, the desktop image otherwise.
 * One <picture>, so the browser downloads only the one it shows.
 */
function ResponsiveImage({
  desktop,
  mobile,
  alt,
  priority,
}: {
  desktop: string;
  mobile: string | null;
  alt: string;
  priority?: boolean;
}) {
  const common = { alt, sizes: "100vw", priority, unoptimized: desktop.endsWith(".svg") };
  const {
    props: { srcSet: desktopSet },
  } = getImageProps({ ...common, src: desktop, width: 1600, height: 640 });
  const { props: img } = getImageProps({
    ...common,
    src: mobile ?? desktop,
    width: 800,
    height: 800,
    unoptimized: (mobile ?? desktop).endsWith(".svg"),
  });
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet={desktopSet} />
      <img {...img} alt={alt} className="h-auto w-full object-cover md:aspect-[5/2]" />
    </picture>
  );
}

function CallToAction({ s, variant }: { s: LiveSection; variant?: "light" }) {
  if (!s.linkUrl) return null;
  return (
    <Button
      asChild
      size="lg"
      className={variant === "light" ? "text-primary bg-[#fbf7f4] hover:bg-white" : undefined}
    >
      <Link href={s.linkUrl}>{s.linkLabel ?? "Shop now"}</Link>
    </Button>
  );
}

/** The homepage built in Admin → Content (Phase 24), in the owner's order. */
export function HomeSections({ sections }: { sections: LiveSection[] }) {
  const firstHero = sections.findIndex((s) => s.kind === "HERO");
  return (
    <div>
      {firstHero === -1 && (
        <h1 className="sr-only">Hallmarked gold, silver and diamond jewellery</h1>
      )}
      {sections.map((s, i) => {
        const Heading = i === firstHero ? "h1" : "h2";
        switch (s.kind) {
          case "HERO":
            return (
              <section key={s.id} className="bg-primary text-primary-foreground relative">
                {s.imageDesktop && (
                  <ResponsiveImage
                    desktop={s.imageDesktop}
                    mobile={s.imageMobile}
                    alt=""
                    priority={i === 0}
                  />
                )}
                <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
                  <Heading className="text-4xl leading-[1.1] md:text-5xl">{s.title}</Heading>
                  {s.subtitle && (
                    <p className="mt-4 max-w-xl text-base leading-relaxed text-[#ead9dd]">
                      {s.subtitle}
                    </p>
                  )}
                  <div className="mt-6">
                    <CallToAction s={s} variant="light" />
                  </div>
                </div>
              </section>
            );
          case "BANNER": {
            const image = (
              <ResponsiveImage
                desktop={s.imageDesktop!}
                mobile={s.imageMobile}
                alt={s.title || "Offer"}
                priority={i === 0}
              />
            );
            return (
              <section
                key={s.id}
                className="mx-auto max-w-6xl px-4 py-6"
                aria-label={s.title || "Offer"}
              >
                {s.linkUrl ? (
                  <Link href={s.linkUrl} className="block overflow-hidden rounded-md">
                    {image}
                  </Link>
                ) : (
                  <div className="overflow-hidden rounded-md">{image}</div>
                )}
              </section>
            );
          }
          case "PRODUCTS":
            return (
              <section key={s.id} className="mx-auto max-w-6xl px-4 py-12">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <Heading className="text-3xl">{s.title}</Heading>
                    {s.subtitle && <p className="text-muted-foreground mt-2">{s.subtitle}</p>}
                  </div>
                  {s.linkUrl && (
                    <Link href={s.linkUrl} className="text-sm underline underline-offset-4">
                      {s.linkLabel ?? "See all"}
                    </Link>
                  )}
                </div>
                <div className="mt-8">
                  <ProductGrid products={s.products} />
                </div>
              </section>
            );
          default:
            return (
              <section key={s.id} className="mx-auto max-w-3xl px-4 py-12 text-center">
                <Heading className="text-3xl">{s.title}</Heading>
                {s.subtitle && <p className="text-muted-foreground mt-2">{s.subtitle}</p>}
                {s.body && <Markdown source={s.body} className="mt-4 space-y-3 leading-relaxed" />}
                <div className="mt-6">
                  <CallToAction s={s} />
                </div>
              </section>
            );
        }
      })}
    </div>
  );
}
