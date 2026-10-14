import "server-only";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { availableStock } from "@/services/inventory.service";
import { searchProductScores } from "@/services/search.service";
import { materialSummary } from "@/lib/jewellery";
import { PAGE_SIZE, slugSchema, type ProductListQuery } from "@/lib/validation/catalog";
import type {
  CategorySummary,
  ProductCardData,
  ProductDetail,
  ProductListResult,
} from "@/types/catalog";

/** Cache tag for every catalog read. Admin edits (Phase 7) call revalidateTag(CATALOG_TAG). */
export const CATALOG_TAG = "catalog";
const CACHE_SECONDS = 300;

const cardSelect = {
  name: true,
  slug: true,
  images: true,
  priceInPaise: true,
  stock: true,
  reservedStock: true,
  reviewCount: true,
  ratingAvgX100: true,
  metalType: true,
  purity: true,
  metalColour: true,
  netWeightMg: true,
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

const FALLBACK_IMAGE = "/images/products/classic-solitaire-ring.svg";

function toCard(row: CardRow): ProductCardData {
  return {
    name: row.name,
    slug: row.slug,
    image: row.images[0] ?? FALLBACK_IMAGE,
    priceInPaise: row.priceInPaise,
    materialSummary: materialSummary(row),
    inStock: availableStock(row) > 0,
    reviewCount: row.reviewCount,
    ratingAvgX100: row.ratingAvgX100,
  };
}

const ORDER_BY: Record<
  Exclude<ProductListQuery["sort"], "relevance" | undefined>,
  Prisma.ProductOrderByWithRelationInput[]
> = {
  rating: [{ ratingAvgX100: "desc" }, { reviewCount: "desc" }, { id: "asc" }],
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  price_asc: [{ priceInPaise: "asc" }, { id: "asc" }],
  price_desc: [{ priceInPaise: "desc" }, { id: "asc" }],
};

/** Active products, filtered, sorted and paginated on the server. */
export const listProducts = unstable_cache(
  async (query: ProductListQuery): Promise<ProductListResult> => {
    // Search: typo-tolerant matching gives the candidate IDs and their relevance.
    const scores = query.q ? await searchProductScores(query.q) : null;
    if (scores && scores.size === 0) return { items: [], total: 0, page: 1, pageCount: 1 };

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      category: { isActive: true, ...(query.category ? { slug: query.category } : {}) },
      ...(scores ? { id: { in: [...scores.keys()] } } : {}),
      ...(query.metal ? { metalType: query.metal } : {}),
      ...(query.purity ? { purity: query.purity } : {}),
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            priceInPaise: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice * 100 } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice * 100 } : {}),
            },
          }
        : {}),
      // In stock = more units than are held in checkouts (compares two columns).
      ...(query.inStock ? { stock: { gt: db.product.fields.reservedStock } } : {}),
      ...(query.rating ? { ratingAvgX100: { gte: query.rating * 100 } } : {}),
    };

    const sort = query.sort ?? (scores ? "relevance" : "newest");
    const skip = (query.page - 1) * PAGE_SIZE;

    if (sort === "relevance" && scores) {
      // Relevance order comes from the search scores, so sort the (at most 500) matches here.
      const rows = await db.product.findMany({ where, select: { ...cardSelect, id: true } });
      rows.sort(
        (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.name.localeCompare(b.name),
      );
      return {
        items: rows.slice(skip, skip + PAGE_SIZE).map(toCard),
        total: rows.length,
        page: query.page,
        pageCount: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
      };
    }

    const [total, rows] = await db.$transaction([
      db.product.count({ where }),
      db.product.findMany({
        where,
        select: cardSelect,
        orderBy: ORDER_BY[sort === "relevance" ? "newest" : sort],
        skip,
        take: PAGE_SIZE,
      }),
    ]);
    return {
      items: rows.map(toCard),
      total,
      page: query.page,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  },
  ["catalog:list:v2"],
  { tags: [CATALOG_TAG], revalidate: CACHE_SECONDS },
);

export const getFeaturedProducts = unstable_cache(
  async (limit = 8): Promise<ProductCardData[]> => {
    const rows = await db.product.findMany({
      where: { isActive: true, isFeatured: true, category: { isActive: true } },
      select: cardSelect,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: limit,
    });
    return rows.map(toCard);
  },
  ["catalog:featured"],
  { tags: [CATALOG_TAG], revalidate: CACHE_SECONDS },
);

export const getCategories = unstable_cache(
  async (): Promise<CategorySummary[]> => {
    const rows = await db.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        name: true,
        slug: true,
        image: true,
        _count: { select: { products: { where: { isActive: true } } } },
      },
    });
    return rows.map((row) => ({
      name: row.name,
      slug: row.slug,
      image: row.image ?? FALLBACK_IMAGE,
      productCount: row._count.products,
    }));
  },
  ["catalog:categories"],
  { tags: [CATALOG_TAG], revalidate: CACHE_SECONDS },
);

/** A single active product, or null (unknown slug, inactive product or inactive category). */
export const getProductBySlug = unstable_cache(
  async (slug: string): Promise<ProductDetail | null> => {
    if (!slugSchema.safeParse(slug).success) return null;

    const row = await db.product.findFirst({
      where: { slug, isActive: true, category: { isActive: true } },
      select: {
        ...cardSelect,
        id: true,
        description: true,
        grossWeightMg: true,
        gemstone: true,
        huid: true,
        isReturnable: true,
        category: { select: { name: true, slug: true } },
      },
    });
    if (!row) return null;

    return {
      ...toCard(row),
      id: row.id,
      description: row.description,
      images: row.images.length ? row.images : [FALLBACK_IMAGE],
      stock: availableStock(row), // what customers can buy right now
      metalType: row.metalType,
      purity: row.purity,
      metalColour: row.metalColour,
      netWeightMg: row.netWeightMg,
      grossWeightMg: row.grossWeightMg,
      gemstone: row.gemstone,
      huid: row.huid,
      isReturnable: row.isReturnable,
      category: row.category,
    };
  },
  ["catalog:product"],
  { tags: [CATALOG_TAG], revalidate: CACHE_SECONDS },
);
