import { z } from "zod";

export const SORT_OPTIONS = ["relevance", "newest", "price_asc", "price_desc", "rating"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const PAGE_SIZE = 12;

/** Turns "?a=1&a=2" into "1" and empty strings into undefined. */
const single = (value: unknown) => {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() !== "" ? first.trim() : undefined;
};

/**
 * Product list filters from the URL. Bad values fall back to defaults instead of
 * erroring, so a mistyped link still shows products.
 */
export const productListQuerySchema = z.object({
  q: z.preprocess(single, z.string().max(100).optional()).catch(undefined),
  category: z
    .preprocess(
      single,
      z
        .string()
        .regex(/^[a-z0-9-]{1,80}$/)
        .optional(),
    )
    .catch(undefined),
  metal: z.preprocess(single, z.enum(["GOLD", "SILVER", "PLATINUM"]).optional()).catch(undefined),
  purity: z
    .preprocess(single, z.enum(["K24", "K22", "K18", "K14", "S925", "PT950"]).optional())
    .catch(undefined),
  sort: z.preprocess(single, z.enum(SORT_OPTIONS).optional()).catch(undefined),
  /** Whole rupees. */
  minPrice: z
    .preprocess(single, z.coerce.number().int().min(0).max(10_000_000).optional())
    .catch(undefined),
  maxPrice: z
    .preprocess(single, z.coerce.number().int().min(0).max(10_000_000).optional())
    .catch(undefined),
  inStock: z.preprocess(single, z.enum(["1"]).optional()).catch(undefined),
  /** Minimum average stars (1–4). */
  rating: z.preprocess(single, z.coerce.number().int().min(1).max(4).optional()).catch(undefined),
  page: z.preprocess(single, z.coerce.number().int().min(1).max(1000).default(1)).catch(1),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const slugSchema = z.string().regex(/^[a-z0-9-]{1,120}$/);
