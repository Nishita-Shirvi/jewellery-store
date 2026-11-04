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
    // Phase 26: errors and traces are tagged with the deployed commit, so Sentry shows which
    // release introduced a problem (and "resolved in next release" works).
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: sampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    sendDefaultPii: false, // never send customer emails/IPs to Sentry
  });
}

/** SENTRY_TRACES_SAMPLE_RATE (0–1) — share of requests traced; default 10%. */
function sampleRate(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 && value !== "" && value !== undefined ? n : 0.1;
}

export const onRequestError = Sentry.captureRequestError;
