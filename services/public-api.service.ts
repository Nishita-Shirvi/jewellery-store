import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { availableStock } from "@/services/inventory.service";

/**
 * Public, read-only Products API (Phase 29) for marketplaces, comparison sites or the owner's
 * other tools. Only active products in active categories; never costs, reservations or anything
 * about customers.
 */
const base = () => publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
const abs = (src: string) => (src.startsWith("http") ? src : `${base()}${src}`);

const select = {
  slug: true,
  name: true,
  description: true,
  priceInPaise: true,
  compareAtPriceInPaise: true,
  stock: true,
  reservedStock: true,
  images: true,
  metalType: true,
  purity: true,
  metalColour: true,
  netWeightMg: true,
  grossWeightMg: true,
  gemstone: true,
  huid: true,
  tags: true,
  countryOfOrigin: true,
  hsnCode: true,
  gstRateBps: true,
  updatedAt: true,
  category: { select: { slug: true, name: true } },
  variants: {
    where: { isActive: true },
    orderBy: { position: "asc" },
    select: {
      sku: true,
      label: true,
      priceInPaise: true,
      compareAtPriceInPaise: true,
      stock: true,
      reservedStock: true,
    },
  },
} satisfies Prisma.ProductSelect;
type Row = Prisma.ProductGetPayload<{ select: typeof select }>;

function toApi(p: Row) {
  return {
    slug: p.slug,
    url: `${base()}/products/${p.slug}`,
    name: p.name,
    description: p.description,
    category: p.category,
    price: { amount: p.priceInPaise / 100, currency: "INR", inclusiveOfTax: true },
    compareAtPrice: p.compareAtPriceInPaise ? p.compareAtPriceInPaise / 100 : null,
    inStock: availableStock(p) > 0,
    images: p.images.map(abs),
    metal: { type: p.metalType, purity: p.purity, colour: p.metalColour },
    weightGrams: {
      net: p.netWeightMg / 1000,
      gross: p.grossWeightMg ? p.grossWeightMg / 1000 : null,
    },
    gemstone: p.gemstone,
    bisHuid: p.huid,
    tags: p.tags,
    countryOfOrigin: p.countryOfOrigin,
    gst: { hsn: p.hsnCode, ratePercent: p.gstRateBps / 100 },
    variants: p.variants.map((v) => ({
      sku: v.sku,
      label: v.label || null,
      price: v.priceInPaise / 100,
      compareAtPrice: v.compareAtPriceInPaise ? v.compareAtPriceInPaise / 100 : null,
      available: Math.max(0, v.stock - v.reservedStock),
    })),
    updatedAt: p.updatedAt.toISOString(),
  };
}

const ACTIVE: Prisma.ProductWhereInput = { isActive: true, category: { isActive: true } };

export async function apiListProducts(q: {
  page: number;
  limit: number;
  category?: string;
  updatedSince?: Date;
}) {
  const where: Prisma.ProductWhereInput = {
    ...ACTIVE,
    ...(q.category ? { category: { isActive: true, slug: q.category } } : {}),
    ...(q.updatedSince ? { updatedAt: { gte: q.updatedSince } } : {}),
  };
  const [total, rows] = await db.$transaction([
    db.product.count({ where }),
    db.product.findMany({
      where,
      select,
      orderBy: [{ updatedAt: "desc" }, { slug: "asc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
  ]);
  return {
    data: rows.map(toApi),
    page: q.page,
    limit: q.limit,
    total,
    pages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

export async function apiGetProduct(slug: string) {
  const row = await db.product.findFirst({ where: { ...ACTIVE, slug }, select });
  return row ? toApi(row) : null;
}
