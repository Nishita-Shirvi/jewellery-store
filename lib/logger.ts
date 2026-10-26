import { config } from "@/lib/config";

/**
 * Structured logger used by all server code. Never use console.* directly.
 *
 *   logger.info("order.paid", { orderId });          // event name = "area.what_happened"
 *   const log = logger.child({ module: "checkout" }); // adds fields to every line
 *   log.error("razorpay.create_failed", { orderId, error });
 *
 * - Level comes from config.ini → [logging] level (debug | info | warn | error),
 *   overridable per environment with LOGGING_LEVEL (or LOG_LEVEL).
 * - Production: one JSON line per event (searchable in Vercel → Logs: filter by "event").
 *   Development: one readable line per event.
 * - Keys that look secret (password, token, secret, signature, …) are replaced with "[redacted]".
 *   Still: never log card data, full addresses or whole request bodies.
 * - error level is also sent to Sentry when SENTRY_DSN is set.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|signature|otp|api_?key|cvv/i;
const pretty = process.env.NODE_ENV === "development";

let minLevel: number = LEVELS[config.logging.level];

/** Test/debug helper: change the level at runtime. */
export function setLogLevel(level: LogLevel) {
  minLevel = LEVELS[level];
}

/** Makes values safe and useful to print: errors keep their stack, secrets are hidden. */
function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  const out: Fields = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : sanitize(v, depth + 1);
  }
  return out;
}

function write(level: LogLevel, event: string, fields: Fields) {
  if (LEVELS[level] < minLevel) return;
  const data = sanitize(fields) as Fields;
  const time = new Date().toISOString();
  const line = pretty
    ? `${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${event}${
        Object.keys(data).length ? " " + JSON.stringify(data) : ""
      }`
    : JSON.stringify({ level, event, time, ...data });

  if (level === "error") {
    console.error(line);
    // Report to Sentry (if configured) so errors trigger alerts.
    const error = Object.values(fields).find((v) => v instanceof Error);
    import("@sentry/nextjs")
      .then((Sentry) =>
        error
          ? Sentry.captureException(error, { extra: { event, ...data } })
          : Sentry.captureMessage(event, { level: "error", extra: data }),
      )
      .catch(() => {});
  } else if (level === "warn") console.warn(line);
  else console.info(line);
}

export interface Logger {
  debug(event: string, data?: Fields): void;
  info(event: string, data?: Fields): void;
  warn(event: string, data?: Fields): void;
  error(event: string, data?: Fields): void;
  /** A logger that adds `bound` fields (e.g. { module: "checkout", orderId }) to every line. */
  child(bound: Fields): Logger;
}

function createLogger(bound: Fields = {}): Logger {
  return {
    debug: (event, data) => write("debug", event, { ...bound, ...data }),
    info: (event, data) => write("info", event, { ...bound, ...data }),
    warn: (event, data) => write("warn", event, { ...bound, ...data }),
    error: (event, data) => write("error", event, { ...bound, ...data }),
    child: (more) => createLogger({ ...bound, ...more }),
  };
}

export const logger = createLogger();

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
