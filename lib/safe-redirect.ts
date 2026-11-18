/**
 * Only allow redirects to paths on this site (e.g. "/account/orders").
 * Blocks "https://evil.com", "//evil.com" and "/\\evil.com" (open-redirect attacks).
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  // Browsers drop tabs/newlines and treat "\\" like "/", so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    // Final check: resolving against a dummy origin must stay on that origin.
    if (new URL(value, "http://x.invalid").origin !== "http://x.invalid") return fallback;
  } catch {
    return fallback;
  }
  return value;
}
