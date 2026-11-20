import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { INDIAN_STATES } from "./india";

/**
 * Application settings from the config/ folder (business rules and store details — never secrets).
 * Every config/*.ini file is read; each [section] may appear in only one file, so a value is
 * always in exactly one place (see Docs/CONFIGURATION.md for which file holds what).
 *
 * Order of precedence for each value:
 *   1. env var SECTION_KEY (e.g. SHIPPING_FEE_RUPEES) — or a legacy name listed in LEGACY_ENV
 *   2. config/*.ini
 *   3. the default in the schema below
 *
 * Like lib/env.ts, this file is imported by next.config.ts so a bad value stops dev/build at once.
 * Server-only: it reads the file system. Never import it from a "use client" component or
 * from middleware.ts (Edge runtime has no file system).
 */

export const CONFIG_DIR = "config";
const CONFIG_FILE = "config/*.ini";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");
const optionalEmail = z.email().optional();
/** "2026-11-06..2026-11-06" (inclusive) or empty. */
const festivalRange = z
  .string()
  .regex(
    /^(\d{4}-\d{2}-\d{2}\s*\.\.\s*\d{4}-\d{2}-\d{2})?$/,
    "use YYYY-MM-DD..YYYY-MM-DD, e.g. 2026-11-06..2026-11-08",
  )
  .default("");

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
    // Phase 26 business alerts (Docs/RUNBOOK.md has what to do for each). 0 = that alert is off.
    no_orders_hours: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 30)
      .default(48),
    payment_failures_min: z.coerce.number().int().min(0).max(1000).default(5),
    payment_failure_rate_percent: z.coerce.number().int().min(1).max(100).default(50),
    payment_window_minutes: z.coerce.number().int().min(5).max(240).default(15),
    error_spike_count: z.coerce.number().int().min(0).max(100_000).default(25),
    bad_webhook_signatures_per_hour: z.coerce.number().int().min(0).max(10_000).default(10),
    stockout_top_sellers: z.coerce.number().int().min(0).max(100).default(10),
    repeat_hours: z.coerce.number().int().min(1).max(168).default(6),
  }),
  returns: z.object({
    window_days: z.coerce.number().int().min(0).max(60).default(7),
  }),
  pricing: z.object({
    /** Rate changes above this % need a tick-box confirmation (catches "per 10 g" typos). */
    large_change_percent: z.coerce.number().int().min(1).max(100).default(15),
    /** Admin dashboard warns when the newest rate is older than this. */
    stale_after_hours: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(36),
    /** Purities shown in the rate strip, in order. */
    strip_purities: z
      .string()
      .default("K22,K24")
      .transform((v) =>
        v
          .split(",")
          .map((p) => p.trim().toUpperCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.enum(["K24", "K22", "K18", "K14", "S925", "PT950"])).max(4)),
  }),
  storefront: z.object({
    /** Thin bar above the header. {free_above} is replaced with the free-shipping amount. */
    announcement: z
      .string()
      .max(160)
      .default("Free insured shipping above ₹{free_above}. Every gold piece is BIS hallmarked."),
    /** Featured pieces on the home page. */
    featured_count: z.coerce.number().int().min(0).max(24).default(8),
    /** Published reviews shown on the home page (0 hides the section). */
    home_reviews: z.coerce.number().int().min(0).max(12).default(3),
  }),
  images: z.object({
    /** cloudinary | r2 | none. "none" = admins pick from built-in placeholder images. */
    provider: z.enum(["cloudinary", "r2", "none"]).default("cloudinary"),
    max_upload_mb: z.coerce.number().int().min(1).max(20).default(5),
    /** Largest home-page video (Admin → Appearance), in MB. Sent straight to Cloudinary. */
    max_video_mb: z.coerce.number().int().min(1).max(100).default(25),
    /** Public base URL of the R2 bucket (custom domain or r2.dev), e.g. https://images.example.com */
    r2_public_url: z
      .union([z.literal(""), z.url().refine((u) => u.startsWith("https://"), "must be https")])
      .default(""),
  }),
  features: z.object({
    sms: bool.default(false),
    visit_booking: bool.default(true),
    whatsapp_button: bool.default(true),
    rate_strip: bool.default(true),
    style_advisor: bool.default(true),
  }),
  cod: z.object({
    enabled: bool.default(true),
    // Kept low on purpose: jewellery COD carries high fraud / refusal (RTO) risk.
    max_order_rupees: z.coerce.number().int().min(0).max(1_000_000).default(10_000),
    fee_rupees: z.coerce.number().int().min(0).max(1_000).default(0),
    // Comma-separated pincodes or prefixes ("500", "500001"). Empty = everywhere.
    pincodes: z
      .string()
      .regex(/^[0-9, ]*$/, "digits and commas only, e.g. 500, 560001")
      .default(""),
    max_refusals: z.coerce.number().int().min(1).max(20).default(2),
    // SMS one-time code before every COD order. Needs MSG91 (see INTEGRATIONS.md).
    otp_required: bool.default(true),
  }),
  marketing: z.object({
    abandoned_cart: bool.default(true),
    abandoned_first_minutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(60),
    abandoned_second_hours: z.coerce
      .number()
      .int()
      .min(1)
      .max(14 * 24)
      .default(24),
    // Percent off in the second reminder, as a single-use coupon for that customer. 0 = none.
    abandoned_coupon_percent: z.coerce.number().int().min(0).max(50).default(0),
    // Coupon (₹) for the referrer after the friend's first delivered order. 0 = referrals off.
    referral_reward_rupees: z.coerce.number().int().min(0).max(100_000).default(500),
    referral_min_order_rupees: z.coerce.number().int().min(0).max(10_000_000).default(2000),
  }),
  support: z.object({
    // Where new tickets and customer replies are emailed. Empty = [business] email.
    notify_email: optionalEmail,
    // WhatsApp business number with country code, e.g. 919876543210. Empty = no WhatsApp button.
    whatsapp_number: z
      .string()
      .regex(/^[0-9+ ]*$/, "digits only, with country code, e.g. 919876543210")
      .default(""),
  }),
  privacy: z.object({
    // Phase 27: how long data no longer needed is kept before the daily clean-up deletes it.
    // Orders and invoices are never deleted (tax records).
    otp_days: z.coerce.number().int().min(1).max(365).default(2),
    password_reset_days: z.coerce.number().int().min(1).max(365).default(7),
    cart_reminder_days: z.coerce.number().int().min(30).max(3650).default(180),
    stock_alert_days: z.coerce.number().int().min(30).max(3650).default(365),
    unconfirmed_subscriber_days: z.coerce.number().int().min(7).max(3650).default(30),
    webhook_event_days: z.coerce.number().int().min(30).max(3650).default(90),
    audit_log_days: z.coerce.number().int().min(365).max(3650).default(730),
  }),
  festivals: z.object({
    // Date ranges "YYYY-MM-DD..YYYY-MM-DD" (India time, both days included). Shown as
    // one-click date pickers when scheduling banners and collections. Empty = not shown.
    // Festival dates follow the lunar calendar: update them every year.
    akshaya_tritiya: festivalRange,
    dhanteras: festivalRange,
    diwali: festivalRange,
    wedding_season: festivalRange,
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;
type RawConfig = Record<string, Record<string, string>>;
type EnvVars = Record<string, string | undefined>;

/** Env var names used before config/*.ini existed; still honoured so old .env files keep working. */
const LEGACY_ENV: Record<string, string> = {
  "shipping.free_above_rupees": "FREE_SHIPPING_ABOVE_RUPEES",
  "features.sms": "FEATURE_SMS",
  "alerts.admin_email": "ADMIN_ALERT_EMAIL",
  "logging.level": "LOG_LEVEL",
};

/** Minimal INI parser: [section], key = value, ; or # comments, optional "quotes". */
export function parseIni(text: string, source = CONFIG_FILE): RawConfig {
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
      throw new Error(`${source} line ${index + 1}: expected "key = value" inside a [section]`);
    }
    const key = line.slice(0, eq).trim().toLowerCase();
    let value = line.slice(eq + 1).trim();
    // Comments go on their own line (; or #). No inline comments: values such as
    // "Shop #12, MG Road" must stay whole.
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
 * Env vars currently overriding config/*.ini, e.g. ["BUSINESS_GSTIN"]. Logged at startup
 * (app.start) because a forgotten override is a classic "I changed config/*.ini but nothing happened".
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

/**
 * Merges several INI files ({ "shipping.ini": text, ... }). A section defined in two files is
 * an error, so nobody edits one copy while the app reads the other.
 */
export function mergeIniFiles(files: Record<string, string>): RawConfig {
  const merged: RawConfig = {};
  const owner: Record<string, string> = {};
  for (const [name, text] of Object.entries(files)) {
    for (const [section, values] of Object.entries(parseIni(text, name))) {
      if (owner[section] && owner[section] !== name) {
        throw new Error(
          `\n❌ [${section}] is defined in both ${owner[section]} and ${name}. Keep it in one file.\n`,
        );
      }
      owner[section] = name;
      merged[section] = { ...merged[section], ...values };
    }
  }
  return merged;
}

export function buildConfig(
  ini: string | Record<string, string>,
  envVars: EnvVars = process.env,
): AppConfig {
  const raw = typeof ini === "string" ? parseIni(ini) : mergeIniFiles(ini);
  const unknown = Object.entries(raw).flatMap(([section, values]) => {
    const shape = (configSchema.shape as Record<string, { shape: Record<string, unknown> }>)[
      section
    ];
    if (!shape) return [`  - [${section}] is not a known section (typo?)`];
    return Object.keys(values)
      .filter((key) => !(key in shape.shape))
      .map((key) => `  - [${section}] ${key} is not a known setting (typo?)`);
  });
  if (unknown.length) {
    throw new Error(`\n❌ Unknown settings in ${CONFIG_FILE}:\n${unknown.join("\n")}\n`);
  }
  const parsed = configSchema.safeParse(applyEnvOverrides(raw, envVars));
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
  const dir = path.join(process.cwd(), CONFIG_DIR);
  const files: Record<string, string> = {};
  let names: string[] = [];
  try {
    names = readdirSync(dir)
      .filter((n) => n.endsWith(".ini"))
      .sort();
  } catch {
    // No folder → schema defaults (+ env overrides). Fine for tests; production ships the folder.
  }
  for (const name of names) files[`config/${name}`] = readFileSync(path.join(dir, name), "utf8");
  return buildConfig(files);
}

/** Validated settings. Import only from server code. */
export const config: AppConfig = loadConfig();
