import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Typo-tolerant product search on Postgres (pg_trgm + full-text):
 *  - each word must match the product's searchText, either as a substring ("ring" in "rings"),
 *    a close spelling (word_similarity ≥ 0.5: "jumka" → "jhumka", "solitare" → "solitaire"),
 *    or a full-text match;
 *  - results are ranked by how closely the words match.
 * searchText is kept up to date by reindexSearchText() whenever products/categories change.
 */

const SEARCH_TEXT_SQL = Prisma.sql`lower(concat_ws(' ',
  p."name", p."gemstone", c."name", replace(p."slug", '-', ' '),
  CASE p."metalType" WHEN 'GOLD' THEN 'gold sona' WHEN 'SILVER' THEN 'silver chandi sterling' ELSE 'platinum' END,
  CASE p."purity" WHEN 'K24' THEN '24k 999' WHEN 'K22' THEN '22k 916' WHEN 'K18' THEN '18k 750' WHEN 'K14' THEN '14k 585' WHEN 'S925' THEN '925 sterling' ELSE 'pt950' END,
  CASE p."metalColour" WHEN 'ROSE' THEN 'rose' WHEN 'WHITE' THEN 'white' WHEN 'YELLOW' THEN 'yellow' ELSE '' END,
  -- General words for the category only (not specific styles like jhumka or kada).
  CASE c."slug" WHEN 'rings' THEN 'ring band' WHEN 'necklaces-pendants' THEN 'necklace pendant chain haar'
                WHEN 'earrings' THEN 'earring' WHEN 'bangles-bracelets' THEN 'bangle bracelet chudi' ELSE '' END
))`;

/** Rebuilds searchText for one product, a category's products, or everything. */
export async function reindexSearchText(scope: { productId?: string; categoryId?: string } = {}) {
  const filter = scope.productId
    ? Prisma.sql`AND p."id" = ${scope.productId}`
    : scope.categoryId
      ? Prisma.sql`AND p."categoryId" = ${scope.categoryId}`
      : Prisma.empty;
  await db.$executeRaw`UPDATE "Product" p SET "searchText" = ${SEARCH_TEXT_SQL} FROM "Category" c WHERE c."id" = p."categoryId" ${filter}`;
}

/** Self-healing: products created before Phase 15 (or by direct SQL) get indexed on first search. */
async function ensureIndexed() {
  const missing = await db.product.count({ where: { searchText: "" } });
  if (missing > 0) await reindexSearchText();
}

function words(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);
}

const escapeLike = (w: string) => w.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Matching active product IDs with a relevance score (best first). */
export async function searchProductScores(
  query: string,
  limit = 500,
): Promise<Map<string, number>> {
  const ws = words(query);
  if (ws.length === 0) return new Map();
  await ensureIndexed();

  const conditions = ws.map(
    (
      w,
    ) => Prisma.sql`(p."searchText" LIKE ${"%" + escapeLike(w) + "%"} OR word_similarity(${w}, p."searchText") >= 0.5
                       OR to_tsvector('simple', p."searchText") @@ plainto_tsquery('simple', ${w}))`,
  );
  const score = Prisma.join(
    ws.map(
      (w) =>
        Prisma.sql`GREATEST(word_similarity(${w}, p."searchText"), CASE WHEN p."searchText" LIKE ${"%" + escapeLike(w) + "%"} THEN 1 ELSE 0 END)`,
    ),
    " + ",
  );
  const rows = await db.$queryRaw<{ id: string; score: number }[]>`
    SELECT p."id", (${score}) + 0.5 * similarity(${ws.join(" ")}, lower(p."name")) AS score
      FROM "Product" p
      JOIN "Category" c ON c."id" = p."categoryId"
     WHERE p."isActive" AND c."isActive" AND ${Prisma.join(conditions, " AND ")}
     ORDER BY score DESC, p."name" ASC
     LIMIT ${limit}`;
  return new Map(rows.map((r) => [r.id, Number(r.score)]));
}

export interface Suggestion {
  name: string;
  slug: string;
  image: string;
  priceInPaise: number;
}

/** Top matches for the header's search-as-you-type box. */
export async function suggestProducts(query: string, limit = 6): Promise<Suggestion[]> {
  const scores = await searchProductScores(query, limit * 3);
  if (scores.size === 0) return [];
  const rows = await db.product.findMany({
    where: { id: { in: [...scores.keys()] } },
    select: { id: true, name: true, slug: true, images: true, priceInPaise: true },
  });
  return rows
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, limit)
    .map((r) => ({
      name: r.name,
      slug: r.slug,
      image: r.images[0] ?? "/images/products/classic-solitaire-ring.svg",
      priceInPaise: r.priceInPaise,
    }));
}
