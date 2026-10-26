import * as Sentry from "@sentry/nextjs";

/** Runs once when the server starts. Sentry is switched on only when SENTRY_DSN is set. */
export async function register() {
  // Node runtime only: the Edge runtime (middleware) has no file system for config.ini.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logStartupSummary } = await import("./lib/startup");
    logStartupSummary();
  }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false, // never send customer emails/IPs to Sentry
  });
}

export const onRequestError = Sentry.captureRequestError;
