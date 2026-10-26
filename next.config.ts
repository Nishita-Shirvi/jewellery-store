import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Validate env vars and config.ini at startup (dev, build and start). Fails fast on any mistake.
import "./lib/env";
import "./lib/config";

const isProd = process.env.NODE_ENV === "production";

/** Security headers for every response. A full Content-Security-Policy arrives in Phase 23. */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" }, // no clickjacking via iframes
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com"), interest-cohort=()',
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }, // Razorpay opens popups for some banks
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // lib/config.ts reads config.ini at runtime; make sure Vercel ships it with every function.
  outputFileTracingIncludes: { "/**": ["./config.ini"] },
  // react-pdf ships its own Node build; bundling it breaks font loading.
  serverExternalPackages: ["@react-pdf/renderer"],
  images: {
    // Placeholder product images until real photos arrive (Docs/note.md, D-07).
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  experimental: {
    serverActions: {
      // Product photos are uploaded through a server action (max 5 MB + form overhead).
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Private pages must never be stored by shared caches.
      {
        source: "/(account|admin|checkout|orders)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

// Sentry: source maps are uploaded only when SENTRY_AUTH_TOKEN is set (on Vercel).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  telemetry: false,
});
