/**
 * Recommendations (Phase 25) — pure helpers, no database. Safe in client and server code.
 */

export const WIDGETS = ["bought_together", "similar", "recent", "trending", "upsell"] as const;
export type Widget = (typeof WIDGETS)[number];

export const WIDGET_LABELS: Record<Widget, string> = {
  bought_together: "Often bought together",
  similar: "You may also like",
  recent: "Recently viewed",
  trending: "Trending now",
  upsell: "Free-shipping suggestions",
};

export function isWidget(v: unknown): v is Widget {
  return typeof v === "string" && (WIDGETS as readonly string[]).includes(v);
}

/** Stats are recorded server-side; the browser may only report clicks. */
export const RECO_EVENTS = ["impression", "click", "add_to_cart"] as const;
export type RecoEvent = (typeof RECO_EVENTS)[number];

/** Spread each counter over a few rows so busy pages never wait on one row lock. */
export const STAT_SHARDS = 8;

// ───────────────────────── cookies ─────────────────────────

/** Recently viewed product addresses (newest first), set by the browser. Not personal data. */
export const RECENT_COOKIE = "rv";
export const RECENT_MAX = 12;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseRecent(value: string | undefined | null): string[] {
  if (!value) return [];
  // Our own values never need decoding ("ring-a.ring-b"); a mangled one is read as-is and
  // anything that isn't a valid address is simply dropped.
  let raw = value;
  try {
    raw = decodeURIComponent(value);
  } catch {
    /* keep raw */
  }
  const slugs = raw.split(".").filter((s) => s.length <= 120 && SLUG_RE.test(s));
  return [...new Set(slugs)].slice(0, RECENT_MAX);
}

/** Puts `slug` first, keeps the list short, and returns the cookie value. */
export function pushRecent(value: string | undefined | null, slug: string): string {
  if (!SLUG_RE.test(slug)) return parseRecent(value).join(".");
  return [slug, ...parseRecent(value).filter((s) => s !== slug)].slice(0, RECENT_MAX).join(".");
}

/**
 * Which widget led to which product: {"<productId>": "similar"}. Set by the server when a
 * recommendation is clicked (http-only), read when adding to cart and when an order is created.
 */
export const ATTRIBUTION_COOKIE = "reco_attr";
export const ATTRIBUTION_MAX = 20;
export const ATTRIBUTION_DAYS = 7;
const ID_RE = /^[a-z0-9]{8,40}$/i;

export function parseAttribution(value: string | undefined | null): Record<string, Widget> {
  if (!value || value.length > 4000) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, Widget> = {};
  for (const [id, w] of Object.entries(parsed as Record<string, unknown>)) {
    if (ID_RE.test(id) && isWidget(w)) out[id] = w;
    if (Object.keys(out).length >= ATTRIBUTION_MAX) break;
  }
  return out;
}

/** Adds (or moves to newest) one product → widget, keeping at most ATTRIBUTION_MAX. */
export function addAttribution(
  value: string | undefined | null,
  productId: string,
  widget: Widget,
): string {
  const current = parseAttribution(value);
  delete current[productId];
  const entries = [...Object.entries(current), [productId, widget] as const].slice(
    -ATTRIBUTION_MAX,
  );
  return encodeURIComponent(JSON.stringify(Object.fromEntries(entries)));
}

// ───────────────────────── scoring ─────────────────────────

export const TREND_DAYS = 14;

/**
 * Trending weight for units sold `ageDays` ago: today counts 14×, 13 days ago counts 1×,
 * older doesn't count. Whole numbers, so scores are exact and comparable run to run.
 */
export function trendWeight(ageDays: number): number {
  const age = Math.floor(ageDays);
  return age >= 0 && age < TREND_DAYS ? TREND_DAYS - age : 0;
}

/**
 * Free-shipping upsell: pieces that cover the gap on their own, cheapest first (the smallest
 * extra spend), skipping what's already in the cart. Empty when there's no gap.
 */
export function pickUpsell<T extends { id: string; priceInPaise: number; inStock: boolean }>(
  candidates: T[],
  gapInPaise: number,
  inCart: Set<string>,
  limit = 4,
): T[] {
  if (gapInPaise <= 0) return [];
  return candidates
    .filter((c) => c.inStock && !inCart.has(c.id) && c.priceInPaise >= gapInPaise)
    .sort((a, b) => a.priceInPaise - b.priceInPaise || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Similar pieces: same category first, then closest in price, then same metal. */
type SimilarShape = { id: string; categoryId: string; priceInPaise: number; metalType: string };
export function rankSimilar<T extends SimilarShape>(
  target: SimilarShape,
  candidates: T[],
  limit = 8,
): T[] {
  return candidates
    .filter((c) => c.id !== target.id)
    .map((c) => ({
      c,
      key: [
        c.categoryId === target.categoryId ? 0 : 1,
        Math.abs(Math.log((c.priceInPaise || 1) / (target.priceInPaise || 1))),
        c.metalType === target.metalType ? 0 : 1,
      ] as const,
    }))
    .sort(
      (a, b) =>
        a.key[0] - b.key[0] ||
        a.key[1] - b.key[1] ||
        a.key[2] - b.key[2] ||
        a.c.id.localeCompare(b.c.id),
    )
    .slice(0, limit)
    .map((x) => x.c);
}

/** Click-through and conversion rates for the report (whole per-mille, no floats in storage). */
export function rate(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part * 100) / whole).toFixed(1)}%`;
}
