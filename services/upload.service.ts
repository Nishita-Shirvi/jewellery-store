import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { errorMessage, logger } from "@/lib/logger";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export class UploadError extends Error {}

export function isUploadConfigured() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

/** Checks the real file bytes, not just the name/type the browser claims. */
function sniffImageType(bytes: Uint8Array): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "image/png";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Signed upload to Cloudinary. Returns the HTTPS URL of the stored image. */
export async function uploadProductImage(file: File): Promise<string> {
  if (!isUploadConfigured())
    throw new UploadError("Image upload isn't set up yet (Cloudinary keys missing).");
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("Images must be 5 MB or smaller.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) throw new UploadError("Only JPG, PNG or WebP images are allowed.");

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "jewellery-store/products";
  const toSign = `folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const signature = createHash("sha1").update(toSign).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([bytes], { type }));
  form.append("api_key", env.CLOUDINARY_API_KEY ?? "");
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  try {
    const response = await fetch(
      `${env.CLOUDINARY_API_BASE}/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(`Cloudinary ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const json = (await response.json()) as { secure_url?: string };
    if (!json.secure_url?.startsWith("https://res.cloudinary.com/"))
      throw new Error("Unexpected Cloudinary response");
    return json.secure_url;
  } catch (error) {
    logger.error("upload.failed", { error: errorMessage(error) });
    throw new UploadError("Upload failed. Please try again.");
  }
}
