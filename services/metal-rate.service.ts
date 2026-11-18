import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import type { Prisma, Purity } from "@prisma/client";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { purityLabel } from "@/lib/jewellery";
import { PURITIES, rateChangeBps, rateLinkedPrice } from "@/lib/metal-pricing";
import { CATALOG_TAG } from "@/services/catalog.service";

/**
 * Metal rates and rate-linked prices.
 *
 * The newest MetalRate row per purity is the current rate. Saving rates recalculates the stored
 * priceInPaise of every RATE_LINKED product of that purity in the same transaction, so the
 * catalogue, filters, cart and checkout keep reading one stored price (and checkout's existing
 * "a price just changed" check protects anyone mid-purchase).
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

/** Rate-linked products per purity, for the admin rates page. */
export async function rateLinkedCounts(): Promise<Partial<Record<Purity, number>>> {
  const rows = await db.product.groupBy({
    by: ["purity"],
    where: { pricingMode: "RATE_LINKED", isActive: true },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.purity, r._count._all]));
}

export class RateError extends Error {}

/** Recalculates rate-linked prices for the given purities (all when omitted). Returns how many changed. */
async function repriceRateLinked(
  tx: Tx,
  rates: CurrentRates,
  purities?: Purity[],
): Promise<number> {
  const products = await tx.product.findMany({
    where: { pricingMode: "RATE_LINKED", ...(purities ? { purity: { in: purities } } : {}) },
    select: {
      id: true,
      purity: true,
      priceInPaise: true,
      netWeightMg: true,
      makingChargeInPaise: true,
      stoneChargeInPaise: true,
      gstRateBps: true,
    },
  });
  let changed = 0;
  for (const p of products) {
    const rate = rates[p.purity];
    if (!rate) continue;
    const price = rateLinkedPrice({ ...p, ratePerGramInPaise: rate.ratePerGramInPaise });
    if (price !== p.priceInPaise && price > 0) {
      await tx.product.update({ where: { id: p.id }, data: { priceInPaise: price } });
      changed++;
    }
  }
  return changed;
}

/**
 * Saves new rates (only the purities given) and reprices rate-linked products.
 * Large jumps need `confirmLarge` — the classic mistake is typing the rate per 10 g.
 */
export async function saveRates(
  adminId: string,
  input: Partial<Record<Purity, number>>,
  confirmLarge: boolean,
): Promise<{
  saved: Purity[];
  repriced: number;
  changes: Record<string, { from: unknown; to: unknown }>;
}> {
  const entries = PURITIES.flatMap((p) => (input[p] ? [[p, input[p]] as const] : []));
  if (entries.length === 0) throw new RateError("Enter at least one rate.");

  const limitBps = config.pricing.large_change_percent * 100;
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
    const saved = entries.map(([p]) => p);
    const changed = Object.keys(changes) as Purity[];
    const after = await readCurrentRates(tx);
    const repriced = changed.length ? await repriceRateLinked(tx, after, changed) : 0;
    return { saved, repriced, changes };
  });

  revalidateTag(RATES_TAG);
  if (result.repriced) revalidateTag(CATALOG_TAG);
  logger.info("metal_rates.saved", { adminId, purities: result.saved, repriced: result.repriced });
  return result;
}

/**
 * The price to store for a product being saved from the admin form. FIXED keeps the typed price;
 * RATE_LINKED calculates it and refuses when no rate exists for the purity yet.
 */
export async function priceForSave(input: {
  pricingMode: "FIXED" | "RATE_LINKED";
  typedPriceInPaise: number | null;
  purity: Purity;
  netWeightMg: number;
  makingChargeInPaise: number;
  stoneChargeInPaise: number;
  gstRateBps: number;
}): Promise<number> {
  if (input.pricingMode === "FIXED") {
    if (!input.typedPriceInPaise) throw new RateError("Enter a price.");
    return input.typedPriceInPaise;
  }
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
