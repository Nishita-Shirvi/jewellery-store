import Link from "next/link";
import { BadgeCheck } from "lucide-react";
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
      className="group bg-card focus-visible:ring-ring flex h-full flex-col shadow-[0_6px_24px_color-mix(in_srgb,var(--s-deep)_7%,transparent)] transition duration-300 outline-none hover:-translate-y-1 hover:shadow-[0_14px_30px_color-mix(in_srgb,var(--s-deep)_13%,transparent)] focus-visible:ring-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="bg-alt relative overflow-hidden">
        <ProductImage
          src={product.image}
          alt={product.name}
          priority={priority}
          className="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        {product.percentOff && product.inStock ? (
          <span className="absolute top-3 left-3 bg-[#047857] px-2 py-1 text-[10px] font-bold tracking-[0.14em] text-white uppercase">
            Sale
          </span>
        ) : null}
        {!product.inStock && (
          <span className="bg-card/95 text-eyebrow border-gilt/30 absolute top-3 left-3 border px-2 py-1 text-[10px] font-bold tracking-[0.14em] uppercase">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 pt-3 pb-4 sm:px-4">
        <p className="text-muted-foreground text-xs tracking-wide">{product.materialSummary}</p>
        <h3
          className="text-head border-gilt/35 border-b pb-2 text-lg leading-snug sm:text-xl"
          style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
        >
          {product.name}
        </h3>
        {product.reviewCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs">
            <Stars avgX100={product.ratingAvgX100} size={12} />
            <span className="text-muted-foreground">({product.reviewCount})</span>
          </p>
        )}
        <div className="text-goldtext mt-auto">
          <Price
            priceInPaise={product.priceInPaise}
            compareAtPriceInPaise={product.compareAtPriceInPaise}
            percentOff={product.percentOff}
          />
        </div>
        {product.hallmarked && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
            <BadgeCheck className="size-3.5" aria-hidden="true" /> BIS hallmarked
          </p>
        )}
      </div>
    </Link>
  );
}
