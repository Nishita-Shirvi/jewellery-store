/**
 * Content-Security-Policy (Phase 23). Built once at startup from env; used by next.config.ts.
 *
 * What it allows, and why:
 *  - scripts: this site, Razorpay Checkout, Google Analytics (only loaded after consent).
 *    'unsafe-inline' stays for scripts because Next.js and the GA snippet inject inline scripts;
 *    a nonce-based policy would force every page to render dynamically (no page cache).
 *  - connections: this site, Razorpay, Google Analytics, the Sentry ingest host from the DSN,
 *    and — in tests only — the local payment stand-in named by RAZORPAY_API_BASE.
 *  - frames: Razorpay's payment window only. Nobody may frame this site (frame-ancestors 'none').
 *  - forms: this site, plus Google's sign-in page (the Google login button posts here then
 *    redirects there; browsers apply form-action to that redirect).
 *  - no plugins (object-src 'none'), no <base> tricks, workers/manifest from this site (PWA).
 */

export interface CspOptions {
  isProd: boolean;
  /** The site's own URL; "upgrade-insecure-requests" only when it's https (else local http breaks). */
  appUrl?: string;
  sentryDsn?: string;
  /** Test-only payment stand-in (RAZORPAY_API_BASE). Ignored unless it's http(s). */
  extraConnect?: string;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(o: CspOptions): string {
  const sentry = originOf(o.sentryDsn);
  const extra = originOf(o.extraConnect);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(o.isProd ? [] : ["'unsafe-eval'"]), // React dev tools / fast refresh only
      "https://checkout.razorpay.com",
      "https://www.googletagmanager.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://res.cloudinary.com",
      "https://placehold.co",
      "https://*.razorpay.com",
      "https://*.google-analytics.com",
      "https://www.googletagmanager.com",
    ],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "https://api.razorpay.com",
      "https://*.razorpay.com",
      "https://*.google-analytics.com",
      "https://*.analytics.google.com",
      "https://www.googletagmanager.com",
      ...(sentry ? [sentry] : []),
      ...(extra ? [extra] : []),
    ],
    "frame-src": ["https://api.razorpay.com", "https://checkout.razorpay.com"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (o.isProd && o.appUrl?.startsWith("https://")) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
