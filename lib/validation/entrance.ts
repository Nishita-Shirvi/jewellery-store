import { z } from "zod";
import { isAllowedImageUrl, isAllowedVideoUrl } from "@/lib/media";

/** Admin → Appearance → Sign-in & top bar input. Server only (media must be on our storage). */

const text = (max: number) => z.string().trim().max(max);

function makeEntranceSchema(strict: boolean) {
  const link = z.string().trim().max(500);
  return z
    .object({
      topBar: z.boolean(),
      tagline: text(80),
      video: z.boolean(),
      videoUrl: strict
        ? link.refine(
            (v) => v === "" || isAllowedVideoUrl(v),
            "Upload the video, or paste a link from our Cloudinary",
          )
        : link,
      poster: strict
        ? link
            .min(1, "Add a still picture")
            .refine((v) => v === "" || isAllowedImageUrl(v), "Upload the picture again")
        : link,
      eyebrow: text(40),
      heading: text(80).min(1, "Enter a heading"),
      text: text(200),
    })
    .refine((s) => !s.topBar || s.tagline !== "", {
      message: "Enter a tagline, or switch the bar off",
      path: ["tagline"],
    })
    .refine((s) => !s.video || s.videoUrl !== "", {
      message: "Upload a video, or switch the video off",
      path: ["videoUrl"],
    });
}

/** As saved and shown: video and picture must be on our storage. */
export const entranceSchema = makeEntranceSchema(true);
/** As stored: shape only, so settings whose link stops passing can still be opened and fixed. */
export const storedEntranceSchema = makeEntranceSchema(false);
