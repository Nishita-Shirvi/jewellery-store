import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 for S3-compatible storage (Cloudflare R2). Pure and unit-tested against
 * AWS's published example, so the upload code needs no SDK dependency.
 */

export interface SignInput {
  method: string;
  host: string;
  /** Already URI-encoded path, e.g. "/bucket/products/abc.jpg". */
  path: string;
  /** Header names are lower-cased by the signer; host is added automatically. */
  headers: Record<string, string>;
  payloadSha256: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** e.g. "20130524T000000Z" */
  amzDate: string;
}

export const sha256Hex = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data).digest();

export function amzDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Encodes each path segment the way S3 expects (RFC 3986, "/" kept). */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((s) =>
      encodeURIComponent(s).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

/** Returns the Authorization header value. */
export function signV4(input: SignInput): string {
  const headers: Record<string, string> = { host: input.host };
  for (const [k, v] of Object.entries(input.headers)) headers[k.toLowerCase()] = v.trim();
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method,
    input.path,
    "",
    canonicalHeaders,
    signedHeaders,
    input.payloadSha256,
  ].join("\n");

  const day = input.amzDate.slice(0, 8);
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonicalRequest)].join(
    "\n",
  );
  const kDate = hmac(`AWS4${input.secretAccessKey}`, day);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}
