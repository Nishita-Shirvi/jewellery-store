import Link from "next/link";
import { ProductImage } from "@/components/catalog/product-image";
import { Price } from "@/components/catalog/price";
import { Stars } from "@/components/reviews/stars";
import type { ProductCardData } from "@/types/catalog";

export function ProductCard({
  product,
  priority,
  trackAs,
}: {
  product: ProductCardData;
  priority?: boolean;
  /** Recommendation widget this card belongs to (Phase 25): its clicks are counted. */
  trackAs?: string;
}) {
  return (
    <Link
      href={`/products/${product.slug}${trackAs ? `?rw=${trackAs}` : ""}`}
      className="group focus-visible:ring-ring block rounded-md outline-none focus-visible:ring-2"
    >
      <div className="border-border bg-muted relative overflow-hidden rounded-md border">
        <ProductImage
          src={product.image}
          alt={product.name}
          priority={priority}
          className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        {product.percentOff && product.inStock ? (
          <span className="absolute top-2 left-2 rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white">
            Sale
          </span>
        ) : null}
        {!product.inStock && (
          <span className="bg-background/90 absolute top-2 left-2 rounded px-2 py-0.5 text-xs font-medium">
            Out of stock
          </span>
        )}
      </div>
      <h3 className="mt-3 text-[15px] leading-snug" style={{ fontFamily: "var(--font-display)" }}>
        {product.name}
      </h3>
      <p className="text-muted-foreground mt-0.5 text-xs">{product.materialSummary}</p>
      {product.reviewCount > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs">
          <Stars avgX100={product.ratingAvgX100} size={12} />
          <span className="text-muted-foreground">({product.reviewCount})</span>
        </p>
      )}
      <div className="mt-1.5">
        <Price
          priceInPaise={product.priceInPaise}
          compareAtPriceInPaise={product.compareAtPriceInPaise}
          percentOff={product.percentOff}
        />
      </div>
    </Link>
  );
}
