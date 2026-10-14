import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";

export const revalidate = 3600;

/** /sitemap.xml: home, all jewellery, every category landing page and every active product. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const [categories, products] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    db.product.findMany({
      where: { isActive: true, category: { isActive: true } },
      select: { slug: true, updatedAt: true },
    }),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.8 },
    ...categories.map((c) => ({
      url: `${base}/collections/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${base}/products/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
