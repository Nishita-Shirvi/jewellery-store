import type { ProductListQuery } from "@/lib/validation/catalog";

/** Builds a /products URL, dropping defaults so links stay short and cache-friendly. */
export function productsUrl(query: Partial<ProductListQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.metal) params.set("metal", query.metal);
  if (query.purity) params.set("purity", query.purity);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}
