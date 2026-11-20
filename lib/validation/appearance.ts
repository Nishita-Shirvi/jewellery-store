import { z } from "zod";
import { DECORATIONS } from "@/lib/appearance";
import { isAllowedImageUrl, isAllowedVideoUrl } from "@/lib/media";
import { COLOR_MODES, HEX_COLOR } from "@/lib/theme";

/**
 * Admin → Appearance input. Server only (checks image/video links against our storage).
 *
 * Two strengths: `themeSchema` (strict) checks that photos and videos are on our storage — used
 * when a theme is saved and before the shop shows it. `storedAppearanceSchema` only checks the
 * shape — used to read what's stored, so a theme whose link stops passing (say, after moving
 * from Cloudinary to R2) is still listed in admin to be fixed, and is never lost on the next save.
 */

const text = (max: number) => z.string().trim().max(max);
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")]);
const hex = z
  .string()
  .trim()
  .regex(HEX_COLOR, "Use a colour like #6b1f2a")
  .transform((v) => v.toLowerCase());

/** A page on this site ("/products?occasion=festive"), never another website. */
export const internalPath = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/(?![/\\])[A-Za-z0-9\-._~/?=&%#+]*$/, "Use a page on this site, starting with /");

export const themeColorsSchema = z.object({
  brand: hex,
  gold: hex,
  bg: hex,
  alt: hex,
  ink: hex,
  muted: hex,
  festive: hex,
});

function heroSchema(strict: boolean) {
  const link = z.string().trim().max(500);
  return z
    .object({
      layout: z.enum(["arch", "video"]),
      image: strict ? link.refine((v) => isAllowedImageUrl(v), "Upload the photo again") : link,
      imageAlt: text(160),
      video: strict
        ? link.refine(
            (v) => v === "" || isAllowedVideoUrl(v),
            "Upload the video, or paste a link from our Cloudinary",
          )
        : link,
      eyebrow: text(80),
      heading: text(120).min(1, "Enter a heading"),
      text: text(240),
      cta: text(40).min(1, "Enter the button label"),
      ctaHref: internalPath,
      captionSmall: text(40),
      captionBig: text(40),
    })
    .refine((h) => h.layout !== "video" || h.video !== "", {
      message: "Upload a video, or choose the photo layout",
      path: ["video"],
    });
}

function makeThemeSchema(strict: boolean) {
  return z
    .object({
      id: z.string().regex(/^[a-z0-9-]{1,40}$/),
      name: text(40).min(1, "Give the theme a name"),
      isDefault: z.boolean(),
      from: day,
      until: day,
      colors: themeColorsSchema,
      decor: z.enum(DECORATIONS.map((d) => d.value) as [string, ...string[]]),
      hero: heroSchema(strict),
      offer: text(160),
    })
    .superRefine((t, ctx) => {
      if (t.isDefault) return;
      if (!t.from) ctx.addIssue({ code: "custom", message: "Choose a start date", path: ["from"] });
      if (!t.until)
        ctx.addIssue({ code: "custom", message: "Choose an end date", path: ["until"] });
      if (t.from && t.until && t.until < t.from)
        ctx.addIssue({ code: "custom", message: "Ends before it starts", path: ["until"] });
    });
}

/** A theme as saved or shown: photos and videos must be on our storage. */
export const themeSchema = makeThemeSchema(true);

function makeAppearanceSchema(strict: boolean) {
  return z
    .object({
      defaultMode: z.enum(COLOR_MODES as [string, ...string[]]),
      themes: z.array(makeThemeSchema(strict)).min(1).max(30),
    })
    .refine((a) => a.themes.filter((t) => t.isDefault).length === 1, "Exactly one Everyday theme")
    .refine((a) => new Set(a.themes.map((t) => t.id)).size === a.themes.length, "Theme ids repeat");
}

/** Every theme strict (tests, and anything that must be shown as it is). */
export const appearanceSchema = makeAppearanceSchema(true);
/** What's stored: shape only, so no theme is dropped because a link stopped passing. */
export const storedAppearanceSchema = makeAppearanceSchema(false);
