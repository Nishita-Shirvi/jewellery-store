import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { HeroVideo } from "@/components/home/hero-video";
import { emphasisParts, type Theme } from "@/lib/appearance";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";

const eyebrow = "block text-[11px] font-bold tracking-[0.2em] uppercase";
const btn =
  "inline-flex items-center gap-2.5 border px-5 py-4 text-[11.5px] font-bold tracking-[0.15em] uppercase outline-none focus-visible:ring-2 focus-visible:ring-gilt focus-visible:ring-offset-2 [&_svg]:size-4";
const h1 =
  "my-6 text-[clamp(2.75rem,6.2vw,5.5rem)] leading-[0.99] tracking-[-0.02em] max-sm:text-[3.1rem]";

/** "Gold for the *forever*": the words between stars in italics. */
export function Emphasised({ text, emClass }: { text: string; emClass: string }) {
  return (
    <>
      {emphasisParts(text).map((part, i) =>
        i % 2 === 1 ? (
          <em key={i} className={cn("font-normal", emClass)}>
            {part}
          </em>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Top of the home page, from the live theme in Admin → Appearance: text beside a photo in an
 * arch, or text over a full-width background video.
 */
export function ThemeHero({ theme }: { theme: Theme }) {
  const h = theme.hero;

  if (h.layout === "video" && h.video) {
    return (
      <section className="bg-deep relative grid min-h-[clamp(440px,52vw,640px)] items-end overflow-hidden text-[#fbf6ee] max-sm:min-h-[560px]">
        <HeroVideo src={h.video} poster={h.image} />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,6,10,.86)_0%,rgba(20,6,10,.6)_42%,rgba(20,6,10,.08)_75%),linear-gradient(0deg,rgba(20,6,10,.55),transparent_45%)]"
        />
        <div className="relative mx-auto w-full max-w-7xl px-4 py-14">
          <div className="max-w-3xl">
            {h.eyebrow && <span className={cn(eyebrow, "text-goldlight")}>{h.eyebrow}</span>}
            <h1 className={h1}>
              <Emphasised text={h.heading} emClass="text-goldlight" />
            </h1>
            {h.text && (
              <p className="max-w-[46ch] text-[17px] leading-relaxed opacity-95">{h.text}</p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={h.ctaHref} className={cn(btn, "bg-btn2 text-btn2fg border-btn2")}>
                {h.cta} <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={cn("relative", theme.decor === "petals" && "vj-petals")}>
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-10 md:grid-cols-2 md:gap-[5vw] md:py-16">
        <div className="min-w-0">
          {h.eyebrow && <span className={cn(eyebrow, "text-eyebrow")}>{h.eyebrow}</span>}
          <h1 className={cn(h1, "text-head")}>
            <Emphasised text={h.heading} emClass="text-em" />
          </h1>
          {h.text && <p className="max-w-[44ch] text-[17px] leading-[1.75]">{h.text}</p>}
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={h.ctaHref} className={cn(btn, "bg-btn text-btnfg border-btn")}>
              {h.cta} <ArrowRight aria-hidden="true" />
            </Link>
            {config.features.visit_booking && (
              <Link href="/visit" className={cn(btn, "text-eyebrow border-current bg-transparent")}>
                Book a visit
              </Link>
            )}
          </div>
          <p className="border-gilt/40 text-muted-foreground mt-10 flex justify-between gap-4 border-t pt-4 text-[10px] font-semibold tracking-[0.16em] uppercase max-sm:hidden">
            <span>{theme.isDefault ? "Gold, with a personal touch" : theme.name}</span>
            <span>Priced at today&apos;s gold rate</span>
          </p>
        </div>
        <figure className="vj-archwrap relative m-0 w-full max-w-[540px] justify-self-center py-3.5 pr-4 sm:pr-7">
          <div className="vj-arch">
            <Image
              src={h.image}
              alt={h.imageAlt}
              fill
              priority
              sizes="(min-width: 768px) 540px, 92vw"
              unoptimized={h.image.endsWith(".svg")}
              className="object-cover"
            />
            {(h.captionSmall || h.captionBig) && (
              <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-[linear-gradient(transparent,rgba(30,8,14,.88))] px-6 pt-16 pb-6 text-[#fbf6ee] sm:px-8 sm:pb-7">
                <div>
                  {h.captionSmall && <span className={eyebrow}>{h.captionSmall}</span>}
                  {h.captionBig && (
                    <strong
                      className="mt-1.5 block text-[28px] leading-tight font-medium sm:text-[34px]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {h.captionBig}
                    </strong>
                  )}
                </div>
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-white/45"
                >
                  <ArrowUpRight className="size-4" />
                </span>
              </figcaption>
            )}
          </div>
          <span aria-hidden="true" className="vj-vnote text-eyebrow">
            A tradition, beautifully reimagined
          </span>
        </figure>
      </div>
    </section>
  );
}
