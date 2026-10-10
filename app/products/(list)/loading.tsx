import { ProductGridSkeleton } from "@/components/catalog/product-grid";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="bg-muted h-7 w-48 animate-pulse rounded motion-reduce:animate-none" />
      <div className="mt-8 grid gap-10 md:grid-cols-[220px_1fr]">
        <div className="hidden space-y-4 md:block">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="bg-muted h-9 animate-pulse rounded motion-reduce:animate-none"
            />
          ))}
        </div>
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
