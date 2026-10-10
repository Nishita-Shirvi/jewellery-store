/**
 * Browser error tracking. Sentry is loaded lazily and only when NEXT_PUBLIC_SENTRY_DSN is set,
 * so it can never delay or break the store's own JavaScript.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const start = () =>
    import("@sentry/nextjs")
      .then((Sentry) =>
        Sentry.init({
          dsn,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
          tracesSampleRate: 0.1,
          sendDefaultPii: false,
        }),
      )
      .catch(() => {});
  // Start after the page is interactive.
  if (document.readyState === "complete") setTimeout(start, 0);
  else window.addEventListener("load", () => setTimeout(start, 0), { once: true });
}

export {};
