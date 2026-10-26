import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { INDIAN_STATES } from "./india";

/**
 * Application settings from config.ini (business rules and store details — never secrets).
 *
 * Order of precedence for each value:
 *   1. env var SECTION_KEY (e.g. SHIPPING_FEE_RUPEES) — or a legacy name listed in LEGACY_ENV
 *   2. config.ini
 *   3. the default in the schema below
 *
 * Like lib/env.ts, this file is imported by next.config.ts so a bad value stops dev/build at once.
 * Server-only: it reads the file system. Never import it from a "use client" component or
 * from middleware.ts (Edge runtime has no file system).
 */

const CONFIG_FILE = "config.ini";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const optionalEmail = z.email().optional();

const configSchema = z.object({
  business: z.object({
    legal_name: z.string().min(2).default("[Your registered business name]"),
    address: z.string().min(5).default("[Registered address, City, State, PIN]"),
    email: z.email().default("support@example.com"),
    phone: z.string().min(6).default("[+91 phone number]"),
    gstin: z.string().min(1).default("[GSTIN]"),
    state: z.enum(INDIAN_STATES).default("Telangana"),
  }),
  grievance_officer: z.object({
    name: z.string().min(2).default("[Grievance officer name]"),
    email: z.email().default("grievance@example.com"),
  }),
  invoice: z.object({
    prefix: z
      .string()
      .regex(/^[A-Z0-9-]{1,10}$/, "use capital letters, digits and '-' only (max 10)")
      .default("INV"),
  }),
  shipping: z.object({
    fee_rupees: z.coerce.number().int().min(0).max(10_000).default(99),
    free_above_rupees: z.coerce.number().int().min(0).max(10_000_000).default(999),
  }),
  inventory: z.object({
    reservation_minutes: z.coerce.number().int().min(5).max(120).default(15),
    low_stock_threshold: z.coerce.number().int().min(0).max(1000).default(3),
  }),
  alerts: z.object({
    admin_email: optionalEmail,
  }),
  features: z.object({
    sms: bool.default(false),
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;
type RawConfig = Record<string, Record<string, string>>;
type EnvVars = Record<string, string | undefined>;

/** Env var names used before config.ini existed; still honoured so old .env files keep working. */
const LEGACY_ENV: Record<string, string> = {
  "shipping.free_above_rupees": "FREE_SHIPPING_ABOVE_RUPEES",
  "features.sms": "FEATURE_SMS",
  "alerts.admin_email": "ADMIN_ALERT_EMAIL",
  "logging.level": "LOG_LEVEL",
};

/** Minimal INI parser: [section], key = value, ; or # comments, optional "quotes". */
export function parseIni(text: string): RawConfig {
  const result: RawConfig = {};
  let section = "";
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const header = /^\[([a-z0-9_]+)\]$/i.exec(line);
    if (header) {
      section = header[1]!.toLowerCase();
      result[section] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1 || !section) {
      throw new Error(
        `${CONFIG_FILE} line ${index + 1}: expected "key = value" inside a [section]`,
      );
    }
    const key = line.slice(0, eq).trim().toLowerCase();
    let value = line.slice(eq + 1).trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    result[section]![key] = value;
  }
  return result;
}

/** The env var (new or legacy name) that overrides [section] key, if one is set and non-empty. */
function overridingEnvName(section: string, key: string, envVars: EnvVars): string | undefined {
  const names = [`${section}_${key}`.toUpperCase(), LEGACY_ENV[`${section}.${key}`]];
  return names.find((n) => n && envVars[n]);
}

/**
 * Env vars currently overriding config.ini, e.g. ["BUSINESS_GSTIN"]. Logged at startup
 * (app.start) because a forgotten override is a classic "I changed config.ini but nothing happened".
 */
export function envOverrides(envVars: EnvVars = process.env): string[] {
  return Object.entries(configSchema.shape).flatMap(([section, shape]) =>
    Object.keys(shape.shape).flatMap((key) => overridingEnvName(section, key, envVars) ?? []),
  );
}

/** Applies env overrides for every key the schema knows about. */
function applyEnvOverrides(raw: RawConfig, envVars: EnvVars): RawConfig {
  const merged: RawConfig = {};
  for (const [section, shape] of Object.entries(configSchema.shape)) {
    merged[section] = { ...raw[section] };
    for (const key of Object.keys(shape.shape)) {
      const name = overridingEnvName(section, key, envVars);
      if (name) merged[section]![key] = envVars[name]!;
    }
    // Empty values in the file mean "use the default".
    for (const [key, value] of Object.entries(merged[section]!)) {
      if (value === "") delete merged[section]![key];
    }
  }
  return merged;
}

export function buildConfig(iniText: string, envVars: EnvVars = process.env): AppConfig {
  const parsed = configSchema.safeParse(applyEnvOverrides(parseIni(iniText), envVars));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) =>
          `  - [${String(issue.path[0])}] ${issue.path.slice(1).map(String).join(".")}: ${issue.message}`,
      )
      .join("\n");
    throw new Error(`\n❌ Invalid settings in ${CONFIG_FILE} (or its env overrides):\n${issues}\n`);
  }
  return parsed.data;
}

function loadConfig(): AppConfig {
  if (typeof window !== "undefined") {
    throw new Error("lib/config.ts was imported in browser code.");
  }
  let text = "";
  try {
    text = readFileSync(path.join(process.cwd(), CONFIG_FILE), "utf8");
  } catch {
    // No file → schema defaults (+ env overrides). Fine for tests; production ships the file.
  }
  return buildConfig(text);
}

/** Validated settings. Import only from server code. */
export const config: AppConfig = loadConfig();
