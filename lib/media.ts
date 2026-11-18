import { config } from "@/lib/config";

/**
 * Which image/video URLs may be saved on products, reviews and returns. Only files we host
 * (built-in /images or /videos paths) or files uploaded to OUR Cloudinary account / R2 bucket.
 * This stops someone pasting a link to content they control elsewhere.
 *
 * Server code only (reads config). It reads the cloud name straight from process.env (not a
 * secret) so validation schemas can use it without loading every server env var.
 */

function cloudinaryPrefix(kind: "image" | "video"): string | null {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  return cloud ? `https://res.cloudinary.com/${cloud}/${kind}/upload/` : null;
}

function r2Prefix(): string | null {
  return config.images.r2_public_url ? `${config.images.r2_public_url.replace(/\/$/, "")}/` : null;
}

const safeUrl = /^https:\/\/[^\s"'<>\\]+$/;

export function isAllowedImageUrl(url: string, { allowLocal = true } = {}): boolean {
  if (allowLocal && /^\/images\/[a-z0-9/_-]+\.(svg|png|jpe?g|webp)$/i.test(url)) return true;
  if (!safeUrl.test(url)) return false;
  const prefixes = [cloudinaryPrefix("image"), r2Prefix()].filter(Boolean) as string[];
  return prefixes.some((p) => url.startsWith(p));
}

export function isAllowedVideoUrl(url: string): boolean {
  if (/^\/videos\/[a-z0-9/_-]+\.(mp4|webm)$/i.test(url)) return true;
  if (!safeUrl.test(url) || !/\.(mp4|webm)(\?.*)?$/i.test(url)) return false;
  const prefixes = [cloudinaryPrefix("video"), r2Prefix()].filter(Boolean) as string[];
  return prefixes.some((p) => url.startsWith(p));
}
