import { z } from "zod";

export const REVIEW_PAGE_SIZE = 5;
export const REVIEW_SORTS = ["newest", "highest", "lowest"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const reviewSchema = z.object({
  productId: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{1,40}$/i),
  rating: z.coerce.number().int().min(1, { message: "Choose a star rating" }).max(5),
  title: z.string().trim().min(3, { message: "Add a short title" }).max(100),
  body: z
    .string()
    .trim()
    .min(10, { message: "Tell us a little more (at least 10 characters)" })
    .max(2000),
  images: z
    .array(z.string().regex(/^https:\/\/res\.cloudinary\.com\/\S+$/))
    .max(3)
    .default([]),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

/** "Priya Sharma" → "Priya S."; nothing more of the customer's identity is shown publicly. */
export function publicAuthorName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Verified buyer";
  const first = parts[0]!.slice(0, 30);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1]![0]!.toUpperCase()}.` : first;
}

/** 467 → "4.7" (one decimal, for display). */
export function formatRating(avgX100: number): string {
  return (Math.round(avgX100 / 10) / 10).toFixed(1);
}

/** Whole and half stars to draw for an average × 100. */
export function starFill(avgX100: number): ("full" | "half" | "empty")[] {
  const halves = Math.round(avgX100 / 50); // nearest half star
  return Array.from({ length: 5 }, (_, i) =>
    halves >= (i + 1) * 2 ? "full" : halves === i * 2 + 1 ? "half" : "empty",
  );
}
