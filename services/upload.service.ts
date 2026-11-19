import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { config } from "@/lib/config";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { isAllowedImageUrl } from "@/lib/media";
import { amzDate, encodePath, sha256Hex, signV4 } from "@/lib/storage/sigv4";

/**
 * Image uploads for products, reviews and returns. The storage provider is chosen in
 * config/images.ini ([images] provider = cloudinary | r2 | none); keys live in .env.
 * Every upload is checked by its real bytes (JPEG/PNG/WebP only — never SVG) and size.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type ImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
const EXTENSION: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_IMAGE_BYTES = config.images.max_upload_mb * 1024 * 1024;

export class UploadError extends Error {}

function cloudinaryReady() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function r2Ready() {
  return Boolean(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET &&
    config.images.r2_public_url,
  );
}

export function isUploadConfigured() {
  switch (config.images.provider) {
    case "cloudinary":
      return cloudinaryReady();
    case "r2":
      return r2Ready();
    case "none":
      return false;
  }
}

/** Checks the real file bytes, not just the name/type the browser claims. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
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

/**
 * Was this URL produced by OUR upload into this folder (our Cloudinary account or R2 bucket)?
 * Customers submit photo URLs with reviews and returns; any other account, bucket or folder is
 * refused. The URL is normalised first, so "../" tricks can't escape the folder.
 */
export function isOwnUpload(url: string, folder: string): boolean {
  return isAllowedImageUrl(url, { allowLocal: false }) && url.includes(`/${folder}/`);
}

/** Product photos. Returns the public HTTPS URL. */
export async function uploadProductImage(file: File): Promise<string> {
  return uploadImage(file, "jewellery-store/products");
}

/** Uploads into a folder of the configured provider. */
export async function uploadImage(file: File, folder: string): Promise<string> {
  if (!isUploadConfigured()) {
    throw new UploadError(
      config.images.provider === "none"
        ? "Image upload is switched off ([images] provider = none)."
        : `Image upload isn't set up yet (${config.images.provider} keys missing).`,
    );
  }
  if (file.size === 0) throw new UploadError("The file is empty.");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UploadError(`Images must be ${config.images.max_upload_mb} MB or smaller.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) throw new UploadError("Only JPG, PNG or WebP images are allowed.");

  try {
    return config.images.provider === "r2"
      ? await uploadToR2(bytes, type, folder)
      : await uploadToCloudinary(bytes, type, folder);
  } catch (error) {
    logger.error("upload.failed", { provider: config.images.provider, error });
    throw new UploadError("Upload failed. Please try again.");
  }
}

async function uploadToCloudinary(bytes: Uint8Array<ArrayBuffer>, type: ImageType, folder: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${folder}&timestamp=${timestamp}${env.CLOUDINARY_API_SECRET}`;
  const signature = createHash("sha1").update(toSign).digest("hex");

  const form = new FormData();
  form.append("file", new Blob([bytes], { type }));
  form.append("api_key", env.CLOUDINARY_API_KEY ?? "");
  form.append("timestamp", String(timestamp));
  form.append("folder", folder);
  form.append("signature", signature);

  const response = await fetch(
    `${env.CLOUDINARY_API_BASE}/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: form, signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok)
    throw new Error(`Cloudinary ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = (await response.json()) as { secure_url?: string };
  if (!json.secure_url?.startsWith("https://res.cloudinary.com/"))
    throw new Error("Unexpected Cloudinary response");
  return json.secure_url;
}

/** PUT to R2's S3-compatible API, signed with SigV4. Keys are random, so names never collide. */
async function uploadToR2(bytes: Uint8Array<ArrayBuffer>, type: ImageType, folder: string) {
  const key = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomBytes(12).toString("hex")}.${EXTENSION[type]}`;
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path = encodePath(`/${env.R2_BUCKET}/${key}`);
  const payloadSha256 = sha256Hex(bytes);
  const date = amzDate(new Date());
  const headers = {
    "content-type": type,
    "cache-control": "public, max-age=31536000, immutable",
    "x-amz-content-sha256": payloadSha256,
    "x-amz-date": date,
  };
  const authorization = signV4({
    method: "PUT",
    host,
    path,
    headers,
    payloadSha256,
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    region: "auto",
    service: "s3",
    amzDate: date,
  });
  const response = await fetch(`https://${host}${path}`, {
    method: "PUT",
    headers: { ...headers, authorization },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`R2 ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return `${config.images.r2_public_url.replace(/\/$/, "")}/${key}`;
}
