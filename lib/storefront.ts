import type { Occasion } from "@prisma/client";
import { z } from "zod";

/** Shop-floor labels and helpers shared by server and client code (no secrets, no DB). */

export const OCCASIONS: Occasion[] = [
  "BRIDAL",
  "FESTIVE",
  "DAILY_WEAR",
  "OFFICE",
  "GIFTING",
  "PARTY",
];

export const occasionLabel: Record<Occasion, string> = {
  BRIDAL: "Bridal",
  FESTIVE: "Festive",
  DAILY_WEAR: "Daily wear",
  OFFICE: "Office wear",
  GIFTING: "Gifting",
  PARTY: "Party",
};

/** URL form of an occasion: "daily-wear" ↔ DAILY_WEAR. */
export function occasionSlug(occasion: Occasion): string {
  return occasion.toLowerCase().replace(/_/g, "-");
}

export function occasionFromSlug(slug: string): Occasion | undefined {
  const value = slug.toUpperCase().replace(/-/g, "_");
  return (OCCASIONS as string[]).includes(value) ? (value as Occasion) : undefined;
}

/** Budget shortcuts shown above the price filter (whole rupees). */
export const BUDGETS: { label: string; minPrice?: number; maxPrice?: number }[] = [
  { label: "Under ₹10,000", maxPrice: 10_000 },
  { label: "₹10,000 – ₹25,000", minPrice: 10_000, maxPrice: 25_000 },
  { label: "₹25,000 – ₹50,000", minPrice: 25_000, maxPrice: 50_000 },
  { label: "₹50,000 – ₹1,00,000", minPrice: 50_000, maxPrice: 100_000 },
  { label: "Above ₹1,00,000", minPrice: 100_000 },
];

// ── Sizes ─────────────────────────────────────────────────

export const MAX_SIZES = 30;
const sizeToken = /^[0-9A-Za-z.\-/ ]{1,12}$/;

/** "10, 12 ,14" or one per line → ["10","12","14"]; duplicates removed, order kept. */
export function parseSizes(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[,\n]/)) {
    const size = raw.trim().replace(/\s+/g, " ");
    if (size) seen.add(size);
  }
  return [...seen];
}

export const sizesSchema = z
  .string()
  .optional()
  .transform((v) => parseSizes(v ?? ""))
  .pipe(
    z
      .array(z.string().regex(sizeToken, { message: "Sizes use letters, numbers, . - / only" }))
      .max(MAX_SIZES, { message: `At most ${MAX_SIZES} sizes` }),
  );

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

// ── WhatsApp ──────────────────────────────────────────────

/** "+91 98765 43210" → "919876543210" (digits only, as wa.me expects). Null if not a plausible number. */
export function whatsappDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function whatsappLink(phone: string, text: string): string | null {
  const digits = whatsappDigits(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

// ── Showroom visits ───────────────────────────────────────

export const VISIT_SLOTS = [
  "Morning (10 am – 1 pm)",
  "Afternoon (1 pm – 4 pm)",
  "Evening (4 pm – 7 pm)",
] as const;
