import { ProductCard } from "@/components/catalog/product-card";
import type { ProductCardData } from "@/types/catalog";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.slug}>
          <ProductCard product={product} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Loading products"
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="animate-pulse motion-reduce:animate-none">
          <div className="bg-muted aspect-square rounded-md" />
          <div className="bg-muted mt-3 h-4 w-3/4 rounded" />
          <div className="bg-muted mt-2 h-3 w-1/2 rounded" />
          <div className="bg-muted mt-2 h-4 w-1/3 rounded" />
        </li>
      ))}
    </ul>
  );
}
