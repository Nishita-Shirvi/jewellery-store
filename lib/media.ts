import { config } from "@/lib/config";

/**
 * Which image/video URLs may be saved on products, reviews and returns. Only files we host
 * (built-in /images or /videos paths) or files uploaded to OUR Cloudinary account / R2 bucket.
 * This stops someone pasting a link to content they control elsewhere.
 *
 * Server code only (reads config). It reads the cloud name straight from process.env (not a
 * secret) so validation schemas can use it without loading every server env var.
 */

function cloudinaryPrefix(kind: "image" | "video", { admin }: { admin: boolean }): string | null {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  if (cloud) return `https://res.cloudinary.com/${cloud}/${kind}/upload/`;
  // No cloud name (e.g. after moving to R2): products saved earlier still carry Cloudinary
  // links, so admins may keep them. Customer uploads stay strict.
  return admin ? "https://res.cloudinary.com/" : null;
}

/** "a/../b" tricks: the browser would resolve them outside the allowed folder. */
function normalised(url: string): string | null {
  if (/\/\.{1,2}(\/|$)|%2e|%2f|%5c/i.test(url)) return null;
  try {
    const href = new URL(url).href;
    return href === url ? href : null;
  } catch {
    return null;
  }
}

function r2Prefix(): string | null {
  return config.images.r2_public_url ? `${config.images.r2_public_url.replace(/\/$/, "")}/` : null;
}

const safeUrl = /^https:\/\/[^\s"'<>\\]+$/;

/** allowLocal = admin context (built-in images allowed); false = customer uploads (strict). */
export function isAllowedImageUrl(url: string, { allowLocal = true } = {}): boolean {
  if (allowLocal && /^\/images\/[a-z0-9/_-]+\.(svg|png|jpe?g|webp)$/i.test(url)) return true;
  if (!safeUrl.test(url)) return false;
  const href = normalised(url);
  if (!href) return false;
  const prefixes = [cloudinaryPrefix("image", { admin: allowLocal }), r2Prefix()].filter(
    Boolean,
  ) as string[];
  return prefixes.some((p) => href.startsWith(p));
}

export function isAllowedVideoUrl(url: string): boolean {
  if (/^\/videos\/[a-z0-9/_-]+\.(mp4|webm)$/i.test(url)) return true;
  if (!safeUrl.test(url) || !/\.(mp4|webm)(\?.*)?$/i.test(url)) return false;
  const href = normalised(url);
  if (!href) return false;
  const prefixes = [cloudinaryPrefix("video", { admin: true }), r2Prefix()].filter(
    Boolean,
  ) as string[];
  return prefixes.some((p) => href.startsWith(p));
}
