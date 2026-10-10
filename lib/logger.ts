/**
 * Minimal structured logger: one JSON line per event, easy to search in Vercel logs.
 * Never pass secrets, card data or full addresses here. (Phase 26 replaces this with pino.)
 */
type Level = "info" | "warn" | "error";

function write(level: Level, event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...data });
  if (level === "error") {
    console.error(line);
    // Also report to Sentry (if configured) so errors trigger alerts.
    import("@sentry/nextjs")
      .then((Sentry) => Sentry.captureMessage(event, { level: "error", extra: data }))
      .catch(() => {});
  } else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, data?: Record<string, unknown>) => write("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => write("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => write("error", event, data),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
