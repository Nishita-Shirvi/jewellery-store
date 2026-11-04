/**
 * Client IP for rate limits and logs.
 *
 * On Vercel, `x-real-ip` / `x-vercel-forwarded-for` are set by Vercel itself and can't be faked
 * by the visitor, so they come first. Otherwise the LAST `x-forwarded-for` entry is used: that's
 * the one the nearest proxy added — the first entry is whatever the client chose to send.
 */
export function getClientIp(headers: Headers): string {
  const trusted = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  if (trusted?.trim()) return trusted.split(",")[0]!.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").at(-1)?.trim();
    if (last) return last;
  }
  return "unknown";
}
