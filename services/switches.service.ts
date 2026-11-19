import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Kill switches (Phase 30): the owner can pause one part of the shop at once from
 * Admin → System — no deploy, no code. Meant for emergencies: a pricing mistake, a coupon
 * being abused, a COD fraud wave, a misbehaving recommendation row.
 *
 * Checked on the server where the action happens (not only hidden in the page), so a paused
 * feature can't be used from an old open tab either. Each server re-reads the switches every
 * few seconds, so a change reaches every instance within SWITCH_TTL_MS.
 */
export const SWITCHES = {
  checkout: {
    label: "Checkout (all new orders and payments)",
    paused: "Checkout is paused for a few minutes. Your cart is saved — please try again soon.",
  },
  cod: {
    label: "Cash on delivery",
    paused: "Cash on delivery is paused right now. You can still pay online.",
  },
  coupons: {
    label: "Coupons",
    paused: "Coupons are paused right now. You can still order without one.",
  },
  recommendations: {
    label: "Recommendation rows",
    paused: "",
  },
} as const;
export type SwitchKey = keyof typeof SWITCHES;
export const SWITCH_KEYS = Object.keys(SWITCHES) as SwitchKey[];

export interface SwitchState {
  /** true = paused (switched off). */
  off: boolean;
  by?: string;
  at?: string;
  note?: string;
}
export type Switches = Record<SwitchKey, SwitchState>;

const KEY = "switches";
export const SWITCH_TTL_MS = 5_000;

const holder = globalThis as unknown as { __switches?: { value: Switches; expires: number } };

function normalise(value: unknown): Switches {
  const v = (value && typeof value === "object" ? value : {}) as Partial<
    Record<string, SwitchState>
  >;
  return Object.fromEntries(
    SWITCH_KEYS.map((k) => [
      k,
      { off: v[k]?.off === true, by: v[k]?.by, at: v[k]?.at, note: v[k]?.note },
    ]),
  ) as Switches;
}

export async function getSwitches(): Promise<Switches> {
  const hit = holder.__switches;
  if (hit && hit.expires > Date.now()) return hit.value;
  let value: Switches;
  try {
    const row = await db.appSetting.findUnique({ where: { key: KEY } });
    value = normalise(row?.value);
  } catch (error) {
    // Can't read them: keep the last known state; with none, everything stays on.
    logger.error("switches.read_failed", { error });
    value = hit?.value ?? normalise(null);
  }
  holder.__switches = { value, expires: Date.now() + SWITCH_TTL_MS };
  return value;
}

export async function isOff(key: SwitchKey): Promise<boolean> {
  return (await getSwitches())[key].off;
}

/** The customer-facing message when `key` (or checkout as a whole) is paused, else null. */
export async function pausedMessage(key: SwitchKey): Promise<string | null> {
  const s = await getSwitches();
  if (key !== "recommendations" && key !== "checkout" && key !== "coupons" && s.checkout.off)
    return SWITCHES.checkout.paused;
  return s[key].off ? SWITCHES[key].paused || "Paused" : null;
}

export async function setSwitch(key: SwitchKey, off: boolean, by: string, note?: string) {
  const current = normalise((await db.appSetting.findUnique({ where: { key: KEY } }))?.value);
  current[key] = { off, by, at: new Date().toISOString(), note: note?.slice(0, 200) || undefined };
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: current as unknown as Prisma.InputJsonValue },
    update: { value: current as unknown as Prisma.InputJsonValue },
  });
  holder.__switches = undefined;
  logger.warn("switches.changed", { key, off, by });
  return current;
}

/** Tests and the admin page: forget the cached copy. */
export function clearSwitchCache() {
  holder.__switches = undefined;
}
