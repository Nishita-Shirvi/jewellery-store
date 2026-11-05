import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clearMemo, memo } from "@/lib/memo";
import { logger } from "@/lib/logger";
import { PAID_STATUSES } from "@/lib/order-status";
import {
  isWidget,
  pickUpsell,
  rankSimilar,
  STAT_SHARDS,
  TREND_DAYS,
  WIDGETS,
  type RecoEvent,
  type Widget,
} from "@/lib/reco";
import { CATALOG_TAG, cardSelect, toCard } from "@/services/catalog.service";
import { availableStock } from "@/services/inventory.service";
import type { ProductCardData } from "@/types/catalog";

/**
 * Recommendations (Phase 25).
 *
 * The heavy work — "bought together" pairs and trending scores — is done once a night by the
 * `reco.compute` job and stored in tables. Pages only read those tables through the cache
 * (tag "reco" + the catalog tag, so a product edit refreshes them too) and every widget renders
 * in its own Suspense boundary, so the page itself is never slower.
 */
export const RECO_TAG = "reco";
const CACHE_SECONDS = 600;
const LAST_RUN_KEY = "reco.computedAt";

/** Orders that show real buying (COD orders count once confirmed). */
const BOUGHT = ["CONFIRMED", "PAID", "SHIPPED", "DELIVERED", "RETURN_REQUESTED"] as const;
const PAIR_DAYS = 365;
const PAIRS_PER_PRODUCT = 12;

const ACTIVE: Prisma.ProductWhereInput = { isActive: true, category: { isActive: true } };
const recoSelect = { ...cardSelect, id: true } satisfies Prisma.ProductSelect;
type RecoRow = Prisma.ProductGetPayload<{ select: typeof recoSelect }>;

export interface RecoCard extends ProductCardData {
  id: string;
}
const toRecoCard = (r: RecoRow): RecoCard => ({ ...toCard(r), id: r.id });
const inStock = (r: RecoRow) => availableStock(r) > 0;

// ───────────────────────── nightly job ─────────────────────────

/** Postgres stores times as UTC without a zone: compare against UTC text (see note D-104). */
const utc = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

/**
 * Rebuilds "bought together" pairs and trending scores from orders. Idempotent: it replaces
 * both tables as a whole inside one transaction, so running it twice gives the same rows; an
 * advisory lock makes a second run at the same moment skip instead of doubling the work.
 */
export async function computeRecommendations(now = new Date()) {
  const since = new Date(now.getTime() - PAIR_DAYS * 86_400_000);
  const trendSince = new Date(now.getTime() - TREND_DAYS * 86_400_000);
  const bought = Prisma.join(BOUGHT.map((s) => Prisma.sql`${s}::"OrderStatus"`));

  const result = await db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(25025) AS locked`;
      if (!lock[0]?.locked) return null;

      await tx.$executeRaw`DELETE FROM "ProductPair"`;
      const pairs = await tx.$executeRaw`
        WITH lines AS (
          SELECT DISTINCT oi."orderId", oi."productId"
          FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
          WHERE o."status" IN (${bought}) AND o."createdAt" >= ${utc(since)}
        ),
        counted AS (
          SELECT a."productId", b."productId" AS "relatedId", COUNT(*)::int AS "orders"
          FROM lines a JOIN lines b ON a."orderId" = b."orderId" AND a."productId" <> b."productId"
          GROUP BY 1, 2
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY "productId" ORDER BY "orders" DESC, "relatedId") AS rn
          FROM counted
        )
        INSERT INTO "ProductPair" ("productId", "relatedId", "orders", "computedAt")
        SELECT "productId", "relatedId", "orders", ${utc(now)} FROM ranked
        WHERE rn <= ${PAIRS_PER_PRODUCT}`;

      await tx.$executeRaw`DELETE FROM "ProductTrend"`;
      // Units × (14 − age in whole days): sold today counts 14×, 13 days ago 1× (lib/reco.ts).
      const trends = await tx.$executeRaw`
        INSERT INTO "ProductTrend" ("productId", "score", "computedAt")
        SELECT oi."productId",
               SUM(oi."quantity" * (${TREND_DAYS} - FLOOR(EXTRACT(EPOCH FROM (${utc(now)} - o."createdAt")) / 86400)))::int,
               ${utc(now)}
        FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
        WHERE o."status" IN (${bought}) AND o."createdAt" >= ${utc(trendSince)}
          AND o."createdAt" <= ${utc(now)}
        GROUP BY oi."productId"`;

      await tx.appSetting.upsert({
        where: { key: LAST_RUN_KEY },
        create: { key: LAST_RUN_KEY, value: now.toISOString() },
        update: { value: now.toISOString() },
      });
      return { pairs, trends };
    },
    { timeout: 60_000 },
  );

  if (!result) {
    logger.info("reco.compute_skipped", { reason: "already_running" });
    return { skipped: true as const };
  }
  revalidateTag(RECO_TAG);
  clearMemo("reco:");
  logger.info("reco.computed", result);
  return { skipped: false as const, ...result };
}

/** True when the last run is older than ~20 hours (or never ran): the cron then queues one. */
export async function recoIsDue(now = new Date()): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: LAST_RUN_KEY } });
  const last = typeof row?.value === "string" ? Date.parse(row.value) : NaN;
  return !Number.isFinite(last) || now.getTime() - last > 20 * 3_600_000;
}

// ───────────────────────── widgets (cached reads) ─────────────────────────

/** "Often bought together" for a product page: in-stock pieces, most shared orders first. */
export const getBoughtTogether = memo(
  "reco:getBoughtTogether",
  unstable_cache(
    async (productId: string, limit = 4): Promise<RecoCard[]> => {
      const pairs = await db.productPair.findMany({
        where: { productId, related: ACTIVE },
        orderBy: [{ orders: "desc" }, { relatedId: "asc" }],
        take: limit * 3,
        select: { related: { select: recoSelect } },
      });
      return pairs
        .map((p) => p.related)
        .filter(inStock)
        .slice(0, limit)
        .map(toRecoCard);
    },
    ["reco:bought-together:v1"],
    { tags: [RECO_TAG, CATALOG_TAG], revalidate: CACHE_SECONDS },
  ),
);

/** "You may also like": same category first, then closest in price, then same metal. */
export const getSimilar = memo(
  "reco:getSimilar",
  unstable_cache(
    async (productId: string, limit = 8): Promise<RecoCard[]> => {
      const target = await db.product.findUnique({
        where: { id: productId },
        select: { id: true, categoryId: true, priceInPaise: true, metalType: true },
      });
      if (!target) return [];
      const candidates = await db.product.findMany({
        where: {
          ...ACTIVE,
          id: { not: productId },
          OR: [{ categoryId: target.categoryId }, { metalType: target.metalType }],
        },
        select: { ...recoSelect, categoryId: true },
        take: 200,
        orderBy: { createdAt: "desc" },
      });
      return rankSimilar(target, candidates.filter(inStock), limit).map(toRecoCard);
    },
    ["reco:similar:v1"],
    { tags: [RECO_TAG, CATALOG_TAG], revalidate: CACHE_SECONDS },
  ),
);

/**
 * "Trending now": best recent sellers. A new store has few orders, so it's topped up with
 * the newest pieces (not the featured ones, which the homepage already shows) — the widget is never empty or random.
 */
export const getTrending = memo(
  "reco:getTrending",
  unstable_cache(
    async (limit = 8): Promise<RecoCard[]> => {
      const trending = await db.productTrend.findMany({
        where: { product: ACTIVE, score: { gt: 0 } },
        orderBy: [{ score: "desc" }, { productId: "asc" }],
        take: limit * 2,
        select: { product: { select: recoSelect } },
      });
      const picked = trending.map((t) => t.product).filter(inStock);
      if (picked.length < limit) {
        const seen = new Set(picked.map((p) => p.id));
        const fill = await db.product.findMany({
          where: { ...ACTIVE, id: { notIn: [...seen] } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: limit * 2,
          select: recoSelect,
        });
        picked.push(...fill.filter(inStock));
      }
      return picked.slice(0, limit).map(toRecoCard);
    },
    ["reco:trending:v1"],
    { tags: [RECO_TAG, CATALOG_TAG], revalidate: CACHE_SECONDS },
  ),
);

/** "Recently viewed", in the order the shopper saw them (slugs come from their cookie). */
export const getRecentlyViewed = memo(
  "reco:getRecentlyViewed",
  unstable_cache(
    async (slugs: string[], excludeSlug?: string): Promise<RecoCard[]> => {
      const wanted = slugs.filter((s) => s !== excludeSlug).slice(0, 8);
      if (wanted.length === 0) return [];
      const rows = await db.product.findMany({
        where: { ...ACTIVE, slug: { in: wanted } },
        select: recoSelect,
      });
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      return wanted.flatMap((s) => (bySlug.has(s) ? [toRecoCard(bySlug.get(s)!)] : []));
    },
    ["reco:recent:v1"],
    { tags: [CATALOG_TAG], revalidate: CACHE_SECONDS },
  ),
);

/** Cart upsell: pieces that alone close the free-shipping gap, cheapest first. */
export const getFreeShippingUpsell = memo(
  "reco:getFreeShippingUpsell",
  unstable_cache(
    async (gapInPaise: number, inCartIds: string[], limit = 4): Promise<RecoCard[]> => {
      if (gapInPaise <= 0) return [];
      const rows = await db.product.findMany({
        where: { ...ACTIVE, priceInPaise: { gte: gapInPaise }, id: { notIn: inCartIds } },
        orderBy: [{ priceInPaise: "asc" }, { id: "asc" }],
        take: limit * 4,
        select: recoSelect,
      });
      return pickUpsell(
        rows.map((r) => ({ ...r, inStock: inStock(r) })),
        gapInPaise,
        new Set(inCartIds),
        limit,
      ).map(toRecoCard);
    },
    ["reco:upsell:v1"],
    { tags: [CATALOG_TAG], revalidate: CACHE_SECONDS },
  ),
);

/** "Often bought together" for the whole cart: pairs of every cart item, best first. */
export const getCartBoughtTogether = memo(
  "reco:getCartBoughtTogether",
  unstable_cache(
    async (productIds: string[], limit = 4): Promise<RecoCard[]> => {
      if (productIds.length === 0) return [];
      const pairs = await db.productPair.groupBy({
        by: ["relatedId"],
        where: { productId: { in: productIds }, relatedId: { notIn: productIds } },
        _sum: { orders: true },
        orderBy: [{ _sum: { orders: "desc" } }, { relatedId: "asc" }],
        take: limit * 3,
      });
      if (pairs.length === 0) return [];
      const rows = await db.product.findMany({
        where: { ...ACTIVE, id: { in: pairs.map((p) => p.relatedId) } },
        select: recoSelect,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return pairs
        .flatMap((p) => (byId.has(p.relatedId) ? [byId.get(p.relatedId)!] : []))
        .filter(inStock)
        .slice(0, limit)
        .map(toRecoCard);
    },
    ["reco:cart-bought-together:v1"],
    { tags: [RECO_TAG, CATALOG_TAG], revalidate: CACHE_SECONDS },
  ),
);

// ───────────────────────── tracking ─────────────────────────

/** Today's date in India (stats are per Indian business day). */
export function istDay(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * Impressions happen on every page view, so they're added up in memory and written in one
 * statement at most every few seconds (or every 200 views). Under load that's one write instead
 * of hundreds, so pages never wait for a database connection because of stats. If a server
 * instance stops before flushing, a few impressions are lost — fine for a rate; clicks,
 * add-to-carts and purchases are always written straight away.
 */
const pendingImpressions = new Map<string, number>(); // "day|widget" → count
let pendingTotal = 0;
let lastFlush = Date.now();
let flushing: Promise<void> | null = null;
const FLUSH_MS = 5_000;
const FLUSH_AT = 200;

export async function flushImpressions(force = false): Promise<void> {
  if (flushing) return flushing;
  if (pendingTotal === 0) return;
  if (!force && pendingTotal < FLUSH_AT && Date.now() - lastFlush < FLUSH_MS) return;
  const batch = [...pendingImpressions.entries()];
  pendingImpressions.clear();
  pendingTotal = 0;
  lastFlush = Date.now();
  const shard = Math.floor(Math.random() * STAT_SHARDS);
  flushing = (async () => {
    try {
      await db.$executeRaw`
        INSERT INTO "RecoStat" ("day", "widget", "event", "shard", "count")
        VALUES ${Prisma.join(
          batch.map(([key, n]) => {
            const [day, widget] = key.split("|");
            return Prisma.sql`(${day}::date, ${widget}, 'impression', ${shard}, ${n})`;
          }),
        )}
        ON CONFLICT ("day", "widget", "event", "shard")
        DO UPDATE SET "count" = "RecoStat"."count" + EXCLUDED."count"`;
    } catch (error) {
      logger.warn("reco.impressions_flush_failed", { error, rows: batch.length });
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/**
 * Adds to a widget counter. Callers run it with after(), so it happens once the page has been
 * sent; a random shard spreads concurrent writes; a failure is logged and never shown.
 */
export async function recordRecoEvent(widget: Widget, event: RecoEvent, n = 1, now = new Date()) {
  if (!isWidget(widget) || n <= 0) return;
  if (event === "impression") {
    const key = `${istDay(now)}|${widget}`;
    pendingImpressions.set(key, (pendingImpressions.get(key) ?? 0) + n);
    pendingTotal += n;
    return flushImpressions();
  }
  const shard = Math.floor(Math.random() * STAT_SHARDS);
  try {
    await db.$executeRaw`
      INSERT INTO "RecoStat" ("day", "widget", "event", "shard", "count")
      VALUES (${istDay(now)}::date, ${widget}, ${event}, ${shard}, ${n})
      ON CONFLICT ("day", "widget", "event", "shard")
      DO UPDATE SET "count" = "RecoStat"."count" + EXCLUDED."count"`;
  } catch (error) {
    logger.warn("reco.stat_failed", { widget, event, error });
  }
}

export interface WidgetReport {
  widget: Widget;
  impressions: number;
  clicks: number;
  addToCarts: number;
  /** Order lines bought after clicking this widget (paid orders). */
  purchases: number;
  revenueInPaise: number;
}

/** Per-widget totals for the last `days` days (India dates), for Admin → Reports. */
export async function recoReport(days = 30, now = new Date()): Promise<WidgetReport[]> {
  await flushImpressions(true);
  const fromDay = istDay(new Date(now.getTime() - (days - 1) * 86_400_000));
  const stats = await db.$queryRaw<{ widget: string; event: string; total: bigint }[]>`
    SELECT "widget", "event", SUM("count")::bigint AS total FROM "RecoStat"
    WHERE "day" >= ${fromDay}::date GROUP BY 1, 2`;
  const since = new Date(`${fromDay}T00:00:00+05:30`);
  const orders = await db.order.findMany({
    where: {
      recoAttribution: { not: Prisma.DbNull },
      status: { in: PAID_STATUSES },
      paidAt: { gte: since },
    },
    select: {
      recoAttribution: true,
      items: { select: { productId: true, lineTotalInPaise: true } },
    },
  });
  const report = new Map<Widget, WidgetReport>(
    WIDGETS.map((w) => [
      w,
      { widget: w, impressions: 0, clicks: 0, addToCarts: 0, purchases: 0, revenueInPaise: 0 },
    ]),
  );
  for (const s of stats) {
    const r = isWidget(s.widget) ? report.get(s.widget) : undefined;
    if (!r) continue;
    const n = Number(s.total);
    if (s.event === "impression") r.impressions += n;
    else if (s.event === "click") r.clicks += n;
    else if (s.event === "add_to_cart") r.addToCarts += n;
  }
  for (const o of orders) {
    const attribution = (o.recoAttribution ?? {}) as Record<string, unknown>;
    for (const item of o.items) {
      const w = attribution[item.productId];
      if (!isWidget(w)) continue;
      const r = report.get(w)!;
      r.purchases += 1;
      r.revenueInPaise += item.lineTotalInPaise;
    }
  }
  return [...report.values()];
}

/**
 * Saves which widget led to each product in a new order (from the shopper's cookie), keeping
 * only products actually in the order. Stats only: never blocks or changes the order.
 */
export async function attributeOrder(
  orderId: string,
  userId: string,
  attribution: Record<string, Widget>,
) {
  if (Object.keys(attribution).length === 0) return;
  try {
    const items = await db.orderItem.findMany({
      where: { orderId, order: { userId } },
      select: { productId: true },
    });
    const kept = Object.fromEntries(
      items
        .filter((i) => attribution[i.productId])
        .map((i) => [i.productId, attribution[i.productId]!]),
    );
    if (Object.keys(kept).length === 0) return;
    await db.order.updateMany({ where: { id: orderId, userId }, data: { recoAttribution: kept } });
  } catch (error) {
    logger.warn("reco.attribute_failed", { orderId, error });
  }
}
