/**
 * Only allow redirects to paths on this site (e.g. "/account/orders").
 * Blocks "https://evil.com", "//evil.com" and "/\\evil.com" (open-redirect attacks).
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
