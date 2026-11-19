/**
 * Only allow redirects to paths on this site (e.g. "/account/orders").
 * Blocks "https://evil.com", "//evil.com", "/\evil.com" and "/%09/evil.com" — browsers drop
 * tabs/newlines while parsing a URL, so "/\t/evil.com" would become "//evil.com" (open redirect).
 * Any control character or backslash is refused, and the result must resolve to this site.
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const base = "https://store.invalid";
    if (new URL(value, base).origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
