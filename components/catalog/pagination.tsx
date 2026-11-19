import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { productsUrl } from "@/lib/catalog-url";
import type { ProductListQuery } from "@/lib/validation/catalog";

export function Pagination({
  query,
  pageCount,
  hrefFor,
}: {
  query: ProductListQuery | { page: number };
  pageCount: number;
  /** Link for a page number (collections, Phase 24). Default: the /products listing. */
  hrefFor?: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const { page } = query;
  const href = hrefFor ?? ((p: number) => productsUrl({ ...(query as ProductListQuery), page: p }));

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page - 1)} rel="prev">
            <ChevronLeft /> Previous
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          <ChevronLeft /> Previous
        </Button>
      )}
      <span className="text-muted-foreground px-3 text-sm" aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Button asChild variant="outline" size="sm">
          <Link href={href(page + 1)} rel="next">
            Next <ChevronRight />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled>
          Next <ChevronRight />
        </Button>
      )}
    </nav>
  );
}
