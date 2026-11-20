import { z } from "zod";
import { isAllowedImageUrl } from "@/lib/media";
import { TILE_MODELS, type CategoryTile } from "@/lib/tiles";

/** Admin → Categories → Tile input. Server only (photo links must be on our storage). */

const photo = (message: string) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || isAllowedImageUrl(v), message);

export const categoryTileSchema = z
  .object({
    model: z.enum(TILE_MODELS.map((m) => m.value) as [string, ...string[]]),
    piece: photo("Upload the product photo again"),
    ar: z.number().min(0.05).max(20),
    cx: z.number().min(0).max(300),
    cy: z.number().min(0).max(400),
    w: z.number().min(8).max(300),
    rot: z.number().min(-180).max(180),
    zoom: photo("Upload the hover photo again"),
    zoomAlt: z.string().trim().max(160),
    modelPhoto: photo("Upload the model photo again"),
  })
  .refine((t) => t.model !== "photo" || t.modelPhoto !== "", {
    message: "Upload a photo of the model, or choose a velvet model",
    path: ["modelPhoto"],
  });

/** A stored tile the shop can show, or null (it then uses the sample tile or the plain photo). */
export function readTile(value: unknown): CategoryTile | null {
  const parsed = categoryTileSchema.safeParse(value);
  return parsed.success ? (parsed.data as CategoryTile) : null;
}
