import Link from "next/link";
import { ProductImage } from "@/components/catalog/product-image";
import { formatINR } from "@/lib/format";
import type { ProductCardData } from "@/types/catalog";

export function ProductCard({
  product,
  priority,
}: {
  product: ProductCardData;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group focus-visible:ring-ring block rounded-md outline-none focus-visible:ring-2"
    >
      <div className="border-border bg-muted relative overflow-hidden rounded-md border">
        <ProductImage
          src={product.image}
          alt={product.name}
          priority={priority}
          className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        {!product.inStock && (
          <span className="bg-background/90 absolute top-2 left-2 rounded px-2 py-0.5 text-xs font-medium">
            Out of stock
          </span>
        )}
      </div>
      <h3 className="mt-3 text-sm font-medium">{product.name}</h3>
      <p className="text-muted-foreground mt-0.5 text-xs">{product.materialSummary}</p>
      <p className="mt-1 text-sm font-semibold">{formatINR(product.priceInPaise)}</p>
    </Link>
  );
}
