import Link from "next/link";
import { ProductImage } from "@/components/catalog/product-image";
import { ProductGrid } from "@/components/catalog/product-grid";
import { Button } from "@/components/ui/button";
import { getCategories, getFeaturedProducts } from "@/services/catalog.service";

export default async function HomePage() {
  const [categories, featured] = await Promise.all([getCategories(), getFeaturedProducts(8)]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Gold, silver and diamond jewellery
        </h1>
        <p className="text-muted-foreground mt-3">
          Placeholder store with dummy products and illustrations. Real photos and the final design
          come later.
        </p>
        <Button asChild className="mt-6">
          <Link href="/products">Browse jewellery</Link>
        </Button>
      </section>

      {categories.length > 0 && (
        <section aria-labelledby="categories-heading" className="mt-14">
          <h2 id="categories-heading" className="text-lg font-medium">
            Shop by category
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/products?category=${category.slug}`}
                  className="group focus-visible:ring-ring block rounded-md outline-none focus-visible:ring-2"
                >
                  <div className="border-border bg-muted overflow-hidden rounded-md border">
                    <ProductImage src={category.image} alt="" />
                  </div>
                  <span className="mt-2 block text-sm font-medium">{category.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="mt-14">
          <h2 id="featured-heading" className="text-lg font-medium">
            Featured pieces
          </h2>
          <div className="mt-4">
            <ProductGrid products={featured} />
          </div>
        </section>
      )}
    </div>
  );
}
