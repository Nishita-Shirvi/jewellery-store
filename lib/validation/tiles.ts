import { z } from "zod";
import { isAllowedImageUrl } from "@/lib/media";
import { TILE_MODELS, type CategoryTile } from "@/lib/tiles";

/** Admin → Categories → Tile input. Server only (photo links must be on our storage). */

function makeTileSchema(strict: boolean) {
  const photo = (message: string) => {
    const link = z.string().trim().max(500);
    return strict ? link.refine((v) => v === "" || isAllowedImageUrl(v), message) : link;
  };
  return z
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
    })
    .refine((t) => !["bust", "head", "hand"].includes(t.model) || t.piece !== "", {
      message: "Upload a product photo to put on the model, or choose No model",
      path: ["piece"],
    });
}

/** As saved and shown: pictures must be on our storage. */
export const categoryTileSchema = makeTileSchema(true);
const storedTileSchema = makeTileSchema(false);

/** A stored tile the shop can show, or null (it then uses the sample tile or the plain photo). */
export function readTile(value: unknown): CategoryTile | null {
  const parsed = categoryTileSchema.safeParse(value);
  return parsed.success ? (parsed.data as CategoryTile) : null;
}

/**
 * A stored tile for the admin editor: shape only, so a tile whose picture link stopped passing
 * (say, after moving storage) still shows as the shop's own tile, to be fixed.
 */
export function readStoredTile(value: unknown): CategoryTile | null {
  const parsed = storedTileSchema.safeParse(value);
  return parsed.success ? (parsed.data as CategoryTile) : null;
}
