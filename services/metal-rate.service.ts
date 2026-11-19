import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import type { Prisma, Purity } from "@prisma/client";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { purityLabel } from "@/lib/jewellery";
import { PURITIES, rateChangeBps, rateLinkedPrice } from "@/lib/metal-pricing";
import { CATALOG_TAG } from "@/services/catalog.service";
import { syncProductSummaries } from "@/services/inventory.service";

/**
 * Metal rates and rate-linked prices.
 *
 * The newest MetalRate row per purity is the current rate. Saving rates first stores the new rows
 * (one short transaction), then reprices the rate-linked products one product per transaction:
 * every variant by its own net weight (a variant may override the purity), then the product's
 * "from" price. Each product transaction reads the newest rates itself, so two admins saving at
 * once can't leave old prices behind, and any number of products fits within the database's
 * transaction time limit. Repricing is idempotent: if it stops half-way, the rates page shows how
 * many products are out of date and "Reprice now" finishes the job. The catalogue, filters, cart
 * and checkout keep reading stored prices; checkout's "a price just changed" check protects anyone
 * mid-purchase.
 */

export const RATES_TAG = "metal-rates";

export interface CurrentRate {
  ratePerGramInPaise: number;
  /** ISO string (cached values must be JSON). */
  updatedAt: string;
}
export type CurrentRates = Partial<Record<Purity, CurrentRate>>;

type Tx = Prisma.TransactionClient;

async function readCurrentRates(client: Tx | typeof db): Promise<CurrentRates> {
  const rows = await client.metalRate.findMany({
    distinct: ["purity"],
    orderBy: [{ purity: "asc" }, { createdAt: "desc" }],
    select: { purity: true, ratePerGramInPaise: true, createdAt: true },
  });
  return Object.fromEntries(
    rows.map((r) => [
      r.purity,
      { ratePerGramInPaise: r.ratePerGramInPaise, updatedAt: r.createdAt.toISOString() },
    ]),
  );
}

export const getCurrentRates = unstable_cache(
  () => readCurrentRates(db),
  ["metal-rates:current:v1"],
  {
    tags: [RATES_TAG],
    revalidate: 600,
  },
);

export async function listRateHistory(limit = 30) {
  return db.metalRate.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      purity: true,
      ratePerGramInPaise: true,
      createdAt: true,
      setBy: { select: { email: true } },
    },
  });
}

/**
 * Rate-linked products per purity, for the admin rates page and the stale-rate warning. A product
 * counts for its own purity and for any purity one of its active variants overrides it with
 * (e.g. an 18K size of a 22K ring), since both need a current rate.
 */
export async function rateLinkedCounts(): Promise<Partial<Record<Purity, number>>> {
  const products = await db.product.findMany({
    where: { pricingMode: "RATE_LINKED", isActive: true },
    select: { purity: true, variants: { where: { isActive: true }, select: { purity: true } } },
  });
  const counts: Partial<Record<Purity, number>> = {};
  for (const p of products) {
    const purities = new Set<Purity>([p.purity]);
    for (const v of p.variants) if (v.purity) purities.add(v.purity);
    for (const purity of purities) counts[purity] = (counts[purity] ?? 0) + 1;
  }
  return counts;
}

export class RateError extends Error {}

const repriceSelect = {
  id: true,
  purity: true,
  makingChargeInPaise: true,
  stoneChargeInPaise: true,
  gstRateBps: true,
  variants: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      purity: true,
      priceInPaise: true,
      compareAtPriceInPaise: true,
      netWeightMg: true,
    },
  },
} satisfies Prisma.ProductSelect;

type RepriceRow = Prisma.ProductGetPayload<{ select: typeof repriceSelect }>;

/** Today's price for one variant, or null when it can't be worked out (no rate / no weight). */
function expectedPrice(
  p: RepriceRow,
  v: RepriceRow["variants"][number],
  rates: CurrentRates,
): number | null {
  const rate = rates[v.purity ?? p.purity];
  if (!rate || v.netWeightMg <= 0) return null;
  const price = rateLinkedPrice({
    ratePerGramInPaise: rate.ratePerGramInPaise,
    netWeightMg: v.netWeightMg,
    makingChargeInPaise: p.makingChargeInPaise,
    stoneChargeInPaise: p.stoneChargeInPaise,
    gstRateBps: p.gstRateBps,
  });
  return price > 0 ? price : null;
}

/**
 * Recalculates the stored price of every variant of the given RATE_LINKED products (all of them
 * when `productIds` is omitted), limited to `purities` when given. Variants whose purity has no rate
 * keep their price. A "was" price that is no longer above the new price is cleared (no fake sale).
 * Returns how many variants changed. Runs inside the caller's transaction.
 */
export async function repriceRateLinked(
  tx: Tx,
  rates: CurrentRates,
  opts: { purities?: Purity[]; productIds?: string[] } = {},
): Promise<number> {
  const products = await tx.product.findMany({
    where: {
      pricingMode: "RATE_LINKED",
      ...(opts.productIds ? { id: { in: opts.productIds } } : {}),
    },
    orderBy: { id: "asc" },
    select: repriceSelect,
  });
  let changed = 0;
  const touched: string[] = [];
  for (const p of products) {
    let productChanged = false;
    for (const v of p.variants) {
      const purity = v.purity ?? p.purity;
      if (opts.purities && !opts.purities.includes(purity)) continue;
      const price = expectedPrice(p, v, rates);
      if (price === null || price === v.priceInPaise) continue;
      const staleWas = v.compareAtPriceInPaise != null && v.compareAtPriceInPaise <= price;
      await tx.productVariant.update({
        where: { id: v.id },
        data: { priceInPaise: price, ...(staleWas ? { compareAtPriceInPaise: null } : {}) },
      });
      changed++;
      productChanged = true;
    }
    if (productChanged) touched.push(p.id);
  }
  if (touched.length) await syncProductSummaries(tx, touched);
  return changed;
}

/** Current rates read inside a transaction (no cache), for repricing one product on save. */
export async function repriceProduct(tx: Tx, productId: string): Promise<number> {
  return repriceRateLinked(tx, await readCurrentRates(tx), { productIds: [productId] });
}

/**
 * Reprices rate-linked products one product per transaction (each reads the newest rates itself).
 * Limited to products that use one of `purities` (own or a variant's) when given. A product that
 * fails is logged and skipped; the others still go through. Safe to run again at any time.
 */
export async function repriceAllRateLinked(
  opts: { purities?: Purity[] } = {},
): Promise<{ repriced: number; failed: number }> {
  const ids = await db.product.findMany({
    where: {
      pricingMode: "RATE_LINKED",
      ...(opts.purities
        ? {
            OR: [
              { purity: { in: opts.purities } },
              { variants: { some: { purity: { in: opts.purities } } } },
            ],
          }
        : {}),
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  let repriced = 0;
  let failed = 0;
  for (const { id } of ids) {
    try {
      repriced += await db.$transaction(async (tx) =>
        repriceRateLinked(tx, await readCurrentRates(tx), {
          productIds: [id],
          purities: opts.purities,
        }),
      );
    } catch (error) {
      failed++;
      logger.error("metal_rates.reprice_failed", { productId: id, error });
    }
  }
  if (repriced) revalidateTag(CATALOG_TAG);
  return { repriced, failed };
}

/**
 * Rate-linked products whose stored prices don't match today's rates (a repricing that stopped
 * half-way, or a rate saved while a product was being edited). Shown on the rates page with a
 * "Reprice now" button.
 */
export async function productsNeedingReprice(): Promise<number> {
  const [rates, products] = await Promise.all([
    readCurrentRates(db),
    db.product.findMany({ where: { pricingMode: "RATE_LINKED" }, select: repriceSelect }),
  ]);
  return products.filter((p) =>
    p.variants.some((v) => {
      const price = expectedPrice(p, v, rates);
      return price !== null && price !== v.priceInPaise;
    }),
  ).length;
}

/**
 * Saves new rates (only the purities given), then reprices rate-linked products.
 * Large jumps need `confirmLarge` — the classic mistake is typing the rate per 10 g.
 */
export async function saveRates(
  adminId: string,
  input: Partial<Record<Purity, number>>,
  confirmLarge: boolean,
): Promise<{
  saved: Purity[];
  /** Variants whose price changed. */
  repriced: number;
  /** Products that couldn't be repriced this time ("Reprice now" retries them). */
  failed: number;
  changes: Record<string, { from: unknown; to: unknown }>;
}> {
  const entries = PURITIES.flatMap((p) => (input[p] ? [[p, input[p]] as const] : []));
  if (entries.length === 0) throw new RateError("Enter at least one rate.");

  const limitBps = config.pricing.large_change_percent * 100;
  // Step 1 (short transaction): check and store the rates.
  const result = await db.$transaction(async (tx) => {
    const before = await readCurrentRates(tx);
    const large = entries.filter(([p, rate]) => {
      const change = rateChangeBps(before[p]?.ratePerGramInPaise, rate);
      return change !== null && Math.abs(change) > limitBps;
    });
    if (large.length && !confirmLarge) {
      const list = large.map(([p]) => purityLabel[p]).join(", ");
      throw new RateError(
        `${list} changed by more than ${config.pricing.large_change_percent}%. Check you typed the rate per gram (not per 10 g), then tick "Yes, these rates are correct".`,
      );
    }
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [purity, rate] of entries) {
      const old = before[purity]?.ratePerGramInPaise ?? null;
      // Saved even when unchanged: it records "checked today" and clears the stale warning.
      await tx.metalRate.create({ data: { purity, ratePerGramInPaise: rate, setById: adminId } });
      if (old !== rate) changes[purity] = { from: old, to: rate };
    }
    return { saved: entries.map(([p]) => p), changes };
  });
  revalidateTag(RATES_TAG);

  // Step 2: reprice, one product per transaction.
  const changed = Object.keys(result.changes) as Purity[];
  const { repriced, failed } = changed.length
    ? await repriceAllRateLinked({ purities: changed })
    : { repriced: 0, failed: 0 };
  logger.info("metal_rates.saved", { adminId, purities: result.saved, repriced, failed });
  return { ...result, repriced, failed };
}

/**
 * Checks a product about to be saved as RATE_LINKED: a rate must exist for its purity and it needs a
 * net weight. Returns the calculated price for the base variant (used as the starting price).
 */
export async function rateLinkedStartPrice(input: {
  purity: Purity;
  netWeightMg: number;
  makingChargeInPaise: number;
  stoneChargeInPaise: number;
  gstRateBps: number;
}): Promise<number> {
  const rate = (await readCurrentRates(db))[input.purity];
  if (!rate) {
    throw new RateError(
      `No ${purityLabel[input.purity]} rate yet. Add it in Admin → Gold rates, or use a fixed price.`,
    );
  }
  if (input.netWeightMg <= 0) throw new RateError("Rate-linked pieces need a net weight.");
  return rateLinkedPrice({ ...input, ratePerGramInPaise: rate.ratePerGramInPaise });
}

/** True when the newest rate is older than [pricing] stale_after_hours (or there are rate-linked products but no rate). */
export async function ratesAreStale(now = new Date()): Promise<boolean> {
  const [rates, counts] = await Promise.all([readCurrentRates(db), rateLinkedCounts()]);
  const linked = Object.keys(counts) as Purity[];
  if (linked.length === 0) return false;
  const limit = config.pricing.stale_after_hours * 3600_000;
  return linked.some((p) => {
    const r = rates[p];
    return !r || now.getTime() - new Date(r.updatedAt).getTime() > limit;
  });
}
