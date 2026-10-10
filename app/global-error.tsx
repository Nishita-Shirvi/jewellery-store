"use client";

import { useEffect } from "react";

/** Last-resort error page (when even the main layout fails). Must render its own <html>. */
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
        style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "6rem 1rem" }}
      >
        <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
        <p>Please refresh the page or try again in a few minutes.</p>
        {error.digest && <p style={{ color: "#666", fontSize: "0.8rem" }}>Code: {error.digest}</p>}
      </body>
    </html>
  );
}
