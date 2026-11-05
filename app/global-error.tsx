"use client";

import { useEffect } from "react";

/**
 * Last-resort error page (when even the main layout fails). Must render its own <html>, and
 * can't rely on the site's styles or components — so plain links with inline styles.
 */
const link = {
  display: "inline-block",
  margin: "0.35rem",
  padding: "0.6rem 1.1rem",
  borderRadius: "0.4rem",
  border: "1px solid #4a1528",
  color: "#4a1528",
  textDecoration: "none",
} as const;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Loaded on demand so Sentry never affects normal pages.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error)).catch(() => {});
    }
  }, [error]);

  return (
    <html lang="en-IN">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "6rem 1rem",
          background: "#fbf7f4",
          color: "#2a1a1f",
        }}
      >
        <h1 style={{ fontSize: "1.6rem", fontWeight: 500 }}>Something went wrong</h1>
        <p style={{ color: "#6b5a60" }}>
          Please refresh the page or try again in a few minutes. Your cart and account are safe.
        </p>
        {error.digest && (
          <p style={{ color: "#6b5a60", fontSize: "0.8rem" }}>Code: {error.digest}</p>
        )}
        <nav aria-label="Where to go next" style={{ marginTop: "1.5rem" }}>
          {/* Plain <a> on purpose: a full page load recovers even when the app itself failed. */}
          {/* eslint-disable @next/next/no-html-link-for-pages */}
          <a href="/" style={{ ...link, background: "#4a1528", color: "#fbf7f4" }}>
            Home
          </a>
          <a href="/products" style={link}>
            Browse jewellery
          </a>
          <a href="/account" style={link}>
            My account / Log in
          </a>
          <a href="/help" style={link}>
            Help
          </a>
          {/* eslint-enable @next/next/no-html-link-for-pages */}
        </nav>
      </body>
    </html>
  );
}
