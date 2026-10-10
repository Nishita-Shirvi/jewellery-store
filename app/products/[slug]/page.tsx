import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/cart/add-to-cart";
import { PincodeChecker } from "@/components/catalog/pincode-checker";
import { ProductImage } from "@/components/catalog/product-image";
import { formatINR, formatWeight } from "@/lib/format";
import { colourLabel, metalLabel, purityLabel, stockStatus } from "@/lib/jewellery";
import { cn } from "@/lib/utils";
import { getProductBySlug } from "@/services/catalog.service";

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
      images: [{ url: product.images[0] ?? product.image, alt: product.name }],
    },
  };
}

const toneClass = {
  ok: "text-emerald-700",
  low: "text-amber-700",
  out: "text-red-700",
} as const;

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const stock = stockStatus(product.stock);
  const details: [string, string][] = [
    [
      "Metal",
      `${metalLabel[product.metalType]} (${colourLabel[product.metalColour].toLowerCase()})`,
    ],
    ["Purity", purityLabel[product.purity]],
    ["Net weight", formatWeight(product.netWeightMg)],
  ];
  if (product.grossWeightMg) details.push(["Gross weight", formatWeight(product.grossWeightMg)]);
  if (product.gemstone) details.push(["Stones", product.gemstone]);
  if (product.huid) details.push(["BIS hallmark (HUID)", product.huid]);
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
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{product.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{product.materialSummary}</p>
          <p className="mt-4 text-2xl font-semibold">{formatINR(product.priceInPaise)}</p>
          <p className="text-muted-foreground text-xs">Inclusive of all taxes</p>
          <p className={cn("mt-3 text-sm font-medium", toneClass[stock.tone])}>{stock.label}</p>

          <div className="mt-6">
            <AddToCart productId={product.id} stock={product.stock} />
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
        </div>
      </div>
    </div>
  );
}
