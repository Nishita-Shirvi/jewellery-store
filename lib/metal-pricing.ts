import type { Purity } from "@prisma/client";

/**
 * Rate-linked pricing (pure, unit-tested). Everything is integer paise / milligrams.
 *
 *   metal value = net weight (g) × rate per gram for the piece's purity
 *   price       = (metal value + making charge + stone charge) × (1 + GST), rounded to the rupee
 *
 * Store prices include GST (see lib/gst.ts), so the GST is added here and extracted again
 * on invoices from the same rate.
 */

export const PURITIES: Purity[] = ["K24", "K22", "K18", "K14", "S925", "PT950"];

export interface RateLinkedInput {
  netWeightMg: number;
  ratePerGramInPaise: number;
  makingChargeInPaise: number;
  stoneChargeInPaise: number;
  gstRateBps: number;
}

export interface PriceBreakup {
  metalValueInPaise: number;
  makingChargeInPaise: number;
  stoneChargeInPaise: number;
  gstInPaise: number;
  priceInPaise: number;
}

export function priceBreakup(input: RateLinkedInput): PriceBreakup {
  const metalValueInPaise = Math.round((input.netWeightMg * input.ratePerGramInPaise) / 1000);
  const beforeTax = metalValueInPaise + input.makingChargeInPaise + input.stoneChargeInPaise;
  const withTax = (beforeTax * (10000 + input.gstRateBps)) / 10000;
  // Jewellers quote whole rupees.
  const priceInPaise = Math.round(withTax / 100) * 100;
  return {
    metalValueInPaise,
    makingChargeInPaise: input.makingChargeInPaise,
    stoneChargeInPaise: input.stoneChargeInPaise,
    gstInPaise: priceInPaise - beforeTax,
    priceInPaise,
  };
}

export function rateLinkedPrice(input: RateLinkedInput): number {
  return priceBreakup(input).priceInPaise;
}

/** Change between two rates in basis points (positive or negative). Null when there is no old rate. */
export function rateChangeBps(oldRate: number | null | undefined, newRate: number): number | null {
  if (!oldRate) return null;
  return Math.round(((newRate - oldRate) * 10000) / oldRate);
}

/** True when the change is bigger than `limitBps` ([pricing] large_change_percent × 100). */
export function isLargeRateChange(
  oldRate: number | null | undefined,
  newRate: number,
  limitBps = 1500,
): boolean {
  const change = rateChangeBps(oldRate, newRate);
  return change !== null && Math.abs(change) > limitBps;
}
