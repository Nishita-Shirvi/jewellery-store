/**
 * Merchandising rules (Phase 24). Pure functions — no database — so they're easy to test and
 * safe to import anywhere.
 */
import { z } from "zod";

// ───────────────────────── live windows ─────────────────────────

export interface Scheduled {
  status: "DRAFT" | "PUBLISHED";
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * Is it live right now? Published, started (or no start), not yet ended (or no end).
 * Checked on every request, so a scheduled banner appears and disappears on its own —
 * no deploy, no background job.
 */
export function isLive(item: Scheduled, now: Date = new Date()): boolean {
  if (item.status !== "PUBLISHED") return false;
  if (item.startsAt && item.startsAt > now) return false;
  if (item.endsAt && item.endsAt <= now) return false;
  return true;
}

/** For the admin list: Draft, Scheduled, Live or Ended. */
export function scheduleLabel(item: Scheduled, now: Date = new Date()) {
  if (item.status === "DRAFT") return "Draft" as const;
  if (item.startsAt && item.startsAt > now) return "Scheduled" as const;
  if (item.endsAt && item.endsAt <= now) return "Ended" as const;
  return "Live" as const;
}

// ───────────────────────── sale prices ─────────────────────────

/**
 * Whole-number % off for a sale badge, rounded down so we never overstate a discount
 * (₹10,000 → ₹6,667 shows 33%, not 34%). Null when there's no real saving.
 */
export function percentOff(priceInPaise: number, compareAtInPaise: number | null | undefined) {
  if (!compareAtInPaise || compareAtInPaise <= priceInPaise || priceInPaise <= 0) return null;
  const pct = Math.floor(((compareAtInPaise - priceInPaise) * 100) / compareAtInPaise);
  return pct >= 1 ? pct : null;
}

// ───────────────────────── collections ─────────────────────────

export const TAG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Bridal, Daily wear , gift" → ["bridal", "daily-wear", "gift"] (deduplicated, max 20). */
export function parseTags(input: string): string[] {
  const tags = input
    .split(/[,\n]/)
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter((t) => t.length > 0 && t.length <= 30);
  return [...new Set(tags)].slice(0, 20);
}

/** Rule-based collection: every rule set must match (AND). Prices in rupees. */
export const collectionRulesSchema = z
  .object({
    categorySlug: z.string().max(80).optional(),
    metalType: z.enum(["GOLD", "SILVER", "PLATINUM"]).optional(),
    purity: z.string().max(10).optional(),
    /** Products with ANY of these tags. */
    tags: z.array(z.string().regex(TAG_RE)).max(20).optional(),
    minPrice: z.number().int().min(0).optional(),
    maxPrice: z.number().int().min(0).optional(),
    /** Only products showing a compare-at ("was") price. */
    onSale: z.boolean().optional(),
    /** Only products added in the last N days. */
    newWithinDays: z.number().int().min(1).max(365).optional(),
  })
  .strict()
  .refine((r) => r.minPrice === undefined || r.maxPrice === undefined || r.minPrice <= r.maxPrice, {
    message: "Minimum price is above the maximum",
  });

export type CollectionRules = z.infer<typeof collectionRulesSchema>;

/** Rules saved in the database are re-checked on read; anything unreadable matches nothing. */
export function readRules(value: unknown): CollectionRules | null {
  const parsed = collectionRulesSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : null;
}

/** A rule collection with no rules would list the whole store by accident. */
export function hasAnyRule(r: CollectionRules): boolean {
  return Object.values(r).some((v) => v !== undefined && !(Array.isArray(v) && v.length === 0));
}

/** Human summary for the admin list, e.g. "Gold · tags: bridal · ₹20,000–₹1,00,000". */
export function describeRules(r: CollectionRules): string {
  const parts: string[] = [];
  if (r.categorySlug) parts.push(`category: ${r.categorySlug}`);
  if (r.metalType) parts.push(r.metalType.toLowerCase());
  if (r.purity) parts.push(r.purity);
  if (r.tags?.length) parts.push(`tags: ${r.tags.join(", ")}`);
  if (r.minPrice !== undefined || r.maxPrice !== undefined)
    parts.push(`₹${r.minPrice ?? 0}–${r.maxPrice !== undefined ? `₹${r.maxPrice}` : "any"}`);
  if (r.onSale) parts.push("on sale");
  if (r.newWithinDays) parts.push(`new in ${r.newWithinDays} days`);
  return parts.join(" · ") || "no rules";
}

/** Ready-made occasion collections (created as drafts by the seed / "Add starter collections"). */
export const STARTER_COLLECTIONS = [
  {
    slug: "bridal",
    title: "Bridal",
    tags: ["bridal"],
    blurb: "Necklaces, bangles and jhumkas for the big day and every ceremony around it.",
  },
  {
    slug: "daily-wear",
    title: "Daily Wear",
    tags: ["daily-wear"],
    blurb: "Light, comfortable pieces made to be worn every day.",
  },
  {
    slug: "festive",
    title: "Festive",
    tags: ["festive"],
    blurb: "Statement gold and kundan for Diwali, Dhanteras and family celebrations.",
  },
  {
    slug: "gifts",
    title: "Gifts",
    tags: ["gift"],
    blurb: "Thoughtful pieces for birthdays, anniversaries and Raksha Bandhan.",
  },
] as const;

// ───────────────────────── festival dates ─────────────────────────

/** "2026-11-06..2026-11-08" → start/end dates (end inclusive). Empty or invalid → null. */
export function parseDateRange(value: string): { from: string; to: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [from, to] = [m[1]!, m[2]!];
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to)) || from > to) return null;
  return { from, to };
}

// ───────────────────────── dates in India time ─────────────────────────

const IST_OFFSET_MS = 330 * 60_000;

/**
 * Admin forms use <input type="datetime-local">, which has no time zone. The owner is in
 * India, and the server (Vercel) runs in UTC, so read it as India time explicitly.
 * "2026-11-06T09:00" → 2026-11-06T03:30:00Z. Empty → null. Invalid → undefined.
 */
export function parseIstLocal(value: string | null | undefined): Date | null | undefined {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS;
  const check = new Date(utc + IST_OFFSET_MS);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined; // 31 Feb etc.
  return new Date(utc);
}

/** The reverse, for filling the form: Date → "2026-11-06T09:00" in India time. */
export function toIstLocal(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** "6 Nov 2026, 9:00 am" in India time, for the admin list. */
export function formatIst(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ───────────────────────── links ─────────────────────────

/**
 * Links typed into banners and announcements: a path on this site ("/collections/bridal") or
 * an https address. Never javascript:, data:, or protocol-relative "//evil.com".
 */
export function safeContentLink(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/[\u0000-\u001f\u007f\\\s]/.test(v)) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
