/**
 * Encrypts small secrets stored in the database (staff authenticator secrets) with AES-256-GCM.
 * The key is derived from AUTH_SECRET, so a copy of the database alone doesn't reveal them.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url). Tampering makes open() throw.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(`secret-box:${purpose}:${secret}`).digest();
}

export function seal(plain: string, secret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, purpose), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function open(sealed: string, secret: string, purpose: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unknown secret format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret, purpose),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
