import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { productsUrl } from "@/lib/catalog-url";
import { config } from "@/lib/config";
import { colourLabel } from "@/lib/jewellery";
import { BUDGETS, OCCASIONS, occasionFromSlug } from "@/lib/storefront";
import { getCategories } from "@/services/catalog.service";

export const metadata: Metadata = {
  title: "Style advisor",
  description: "Answer four quick questions and see jewellery picked for your occasion and budget.",
  alternates: { canonical: "/style-advisor" },
};

const COLOURS = ["YELLOW", "ROSE", "WHITE", "SILVER"] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * A short quiz that turns answers into catalogue filters. It works without JavaScript: the form
 * submits here with GET and the answers redirect to the matching /products page.
 */
export default async function StyleAdvisorPage({ searchParams }: { searchParams: SearchParams }) {
  if (!config.features.style_advisor) notFound();
  const sp = await searchParams;
  const categories = await getCategories();

  if (one(sp.go) === "1") {
    const budget = BUDGETS[Number.parseInt(one(sp.budget), 10)];
    const colour = COLOURS.find((c) => c === one(sp.colour));
    const category = categories.find((c) => c.slug === one(sp.category))?.slug;
    redirect(
      productsUrl({
        occasion: occasionFromSlug(one(sp.occasion)),
        colour,
        category,
        minPrice: budget?.minPrice,
        maxPrice: budget?.maxPrice,
        inStock: "1",
        sort: "rating",
      }),
    );
  }

  const question = "space-y-3";
  const option =
    "has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-ring border-border flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 text-sm has-[:focus-visible]:ring-2";

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl md:text-4xl">Style advisor</h1>
      <p className="text-muted-foreground mt-3">
        Four quick questions and we&apos;ll show pieces that fit. Skip any you&apos;re unsure about.
      </p>

      <form action="/style-advisor" method="get" className="mt-10 space-y-10">
        <input type="hidden" name="go" value="1" />

        <fieldset className={question}>
          <legend className="text-lg font-medium">1. What&apos;s the occasion?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OCCASIONS.map((o) => (
              <label key={o.tag} className={option}>
                <input type="radio" name="occasion" value={o.tag} className="sr-only" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={question}>
          <legend className="text-lg font-medium">2. What are you looking for?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map((c) => (
              <label key={c.slug} className={option}>
                <input type="radio" name="category" value={c.slug} className="sr-only" />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className={question}>
          <legend className="text-lg font-medium">3. Which metal colour suits you?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COLOURS.map((c) => (
              <label key={c} className={option}>
                <input type="radio" name="colour" value={c} className="sr-only" />
                {c === "SILVER" ? "Silver" : `${colourLabel[c]} gold`}
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Warm skin tones often glow in yellow and rose gold; cool tones in white gold and silver.
            It&apos;s only a guide — wear what you love.
          </p>
        </fieldset>

        <fieldset className={question}>
          <legend className="text-lg font-medium">4. Your budget</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {BUDGETS.map((b, i) => (
              <label key={b.label} className={option}>
                <input type="radio" name="budget" value={i} className="sr-only" />
                {b.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" size="lg">
          Show my picks
        </Button>
      </form>
    </div>
  );
}
