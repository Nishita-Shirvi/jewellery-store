import { z } from "zod";
import { isAllowedImageUrl } from "@/lib/media";
import { POPUP_ACTIONS, POPUP_DELAYS } from "@/lib/popup";
import { internalPath } from "@/lib/validation/appearance";

/** Admin → Appearance → Popup input. Server only (the picture must be on our storage). */

const text = (max: number) => z.string().trim().max(max);
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")]);

function makePopupSchema(strict: boolean) {
  const image = z.string().trim().max(500);
  return z
    .object({
      on: z.boolean(),
      from: day,
      until: day,
      image: strict ? image.refine((v) => isAllowedImageUrl(v), "Upload the picture again") : image,
      imageAlt: text(160),
      eyebrow: text(60),
      heading: text(90).min(1, "Enter a heading"),
      text: text(220),
      action: z.enum(POPUP_ACTIONS.map((a) => a.value) as [string, ...string[]]),
      cta: text(36).min(1, "Enter the button label"),
      link: internalPath,
      delay: z.enum(POPUP_DELAYS.map((d) => d.value) as [string, ...string[]]),
      againDays: z.union([z.literal(0), z.literal(1), z.literal(7), z.literal(30)]),
      where: z.enum(["home", "all"]),
      version: z.string().max(40),
    })
    .refine((p) => !p.from || !p.until || p.from <= p.until, {
      message: "Ends before it starts",
      path: ["until"],
    });
}

/** As saved and shown: the picture must be on our storage. */
export const popupSchema = makePopupSchema(true);
/** As stored: shape only, so a popup whose picture link stops passing can still be fixed. */
export const storedPopupSchema = makePopupSchema(false);
