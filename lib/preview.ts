import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Preview links for drafts (Phase 24): "/collections/diwali?preview=<expiry>.<signature>".
 * The signature covers what is being previewed and until when, using AUTH_SECRET, so a link
 * for one draft can't open another, can't be extended, and stops working after 48 hours.
 */
export const PREVIEW_HOURS = 48;

export type PreviewKind = "collection" | "page" | "home";

function sign(kind: PreviewKind, id: string, expires: number): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`preview:${kind}:${id}:${expires}`)
    .digest("base64url");
}

export function makePreviewToken(kind: PreviewKind, id: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + PREVIEW_HOURS * 3600;
  return `${expires}.${sign(kind, id, expires)}`;
}

export function checkPreviewToken(
  kind: PreviewKind,
  id: string,
  token: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!token || token.length > 200) return false;
  const m = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return false;
  const expires = Number(m[1]);
  if (expires * 1000 <= now) return false;
  const expected = Buffer.from(sign(kind, id, expires));
  const given = Buffer.from(m[2]!);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
