/**
 * Admin → Appearance → Sign-in & top bar: the background video on the log-in and create-account
 * pages, and the slim tagline bar above the header. Pure: shared by the shop, admin and tests.
 */

export interface EntranceSettings {
  /** Show the tagline bar above the header on shop pages. */
  topBar: boolean;
  tagline: string;
  /** Play the video behind the log-in and create-account pages. */
  video: boolean;
  /** MP4/WebM on our site (/videos/…), Cloudinary or R2. */
  videoUrl: string;
  /** Still shown before the video plays, and instead of it (reduced motion, data saver, off). */
  poster: string;
  eyebrow: string;
  heading: string;
  text: string;
}

export const DEFAULT_VIDEO = "/videos/login-bg.mp4";
export const DEFAULT_POSTER = "/images/editorial/login-poster.jpg";

export const DEFAULT_ENTRANCE: EntranceSettings = {
  topBar: true,
  tagline: "A little gold. A lifetime of stories.",
  video: true,
  videoUrl: DEFAULT_VIDEO,
  poster: DEFAULT_POSTER,
  eyebrow: "Welcome",
  heading: "Jewellery made to be handed down",
  text: "Sign in to see your saved cart, wishlist and orders in one place.",
};

/** The video to play, or null (switched off or no video). The still always shows underneath. */
export function entranceVideo(s: Pick<EntranceSettings, "video" | "videoUrl">): string | null {
  return s.video && s.videoUrl ? s.videoUrl : null;
}

/** The tagline for the top bar, or null (switched off or empty). */
export function entranceTagline(s: Pick<EntranceSettings, "topBar" | "tagline">): string | null {
  const t = s.tagline.trim();
  return s.topBar && t ? t : null;
}
