/** Shop-floor labels and helpers shared by server and client code (no secrets, no DB). */

/**
 * Occasions are product tags (Admin → product → Tags, e.g. "bridal, festive"), the same tags the
 * occasion collections in Admin → Content use. The catalogue filter, style advisor and home tiles
 * offer these.
 */
export const OCCASIONS = [
  { tag: "bridal", label: "Bridal" },
  { tag: "festive", label: "Festive" },
  { tag: "daily-wear", label: "Daily wear" },
  { tag: "office-wear", label: "Office wear" },
  { tag: "gift", label: "Gifting" },
  { tag: "party", label: "Party" },
] as const;

export type OccasionTag = (typeof OCCASIONS)[number]["tag"];

export function occasionFromSlug(slug: string): OccasionTag | undefined {
  return OCCASIONS.find((o) => o.tag === slug)?.tag;
}

export function occasionLabel(tag: string): string {
  return OCCASIONS.find((o) => o.tag === tag)?.label ?? tag;
}

/** Budget shortcuts shown above the price filter (whole rupees). */
export const BUDGETS: { label: string; minPrice?: number; maxPrice?: number }[] = [
  { label: "Under ₹10,000", maxPrice: 10_000 },
  { label: "₹10,000 – ₹25,000", minPrice: 10_000, maxPrice: 25_000 },
  { label: "₹25,000 – ₹50,000", minPrice: 25_000, maxPrice: 50_000 },
  { label: "₹50,000 – ₹1,00,000", minPrice: 50_000, maxPrice: 100_000 },
  { label: "Above ₹1,00,000", minPrice: 100_000 },
];

// ── Size guide ────────────────────────────────────────────

/** Indian ring sizes with inner circumference (mm) and diameter (mm). */
export const RING_SIZES: { size: number; circumferenceMm: number; diameterMm: number }[] = [
  { size: 6, circumferenceMm: 46.5, diameterMm: 14.8 },
  { size: 8, circumferenceMm: 48.0, diameterMm: 15.3 },
  { size: 10, circumferenceMm: 49.9, diameterMm: 15.9 },
  { size: 12, circumferenceMm: 51.9, diameterMm: 16.5 },
  { size: 14, circumferenceMm: 53.8, diameterMm: 17.1 },
  { size: 16, circumferenceMm: 55.7, diameterMm: 17.7 },
  { size: 18, circumferenceMm: 57.6, diameterMm: 18.3 },
  { size: 20, circumferenceMm: 59.5, diameterMm: 18.9 },
  { size: 22, circumferenceMm: 61.4, diameterMm: 19.5 },
  { size: 24, circumferenceMm: 63.3, diameterMm: 20.2 },
];

/** Bangle sizes (inches, Indian convention) with inner diameter (mm). */
export const BANGLE_SIZES: { size: string; diameterMm: number }[] = [
  { size: "2.2", diameterMm: 54.0 },
  { size: "2.4", diameterMm: 57.2 },
  { size: "2.6", diameterMm: 60.3 },
  { size: "2.8", diameterMm: 63.5 },
  { size: "2.10", diameterMm: 66.7 },
  { size: "2.12", diameterMm: 69.9 },
];

// ── Showroom visits ───────────────────────────────────────

export const VISIT_SLOTS = [
  "Morning (10 am – 1 pm)",
  "Afternoon (1 pm – 4 pm)",
  "Evening (4 pm – 7 pm)",
] as const;
