import { z } from "zod";
import { INDIAN_STATES } from "./india";

/**
 * Typed, validated environment variables.
 *
 * This file is imported by next.config.ts, so `npm run dev` / `npm run build`
 * stop immediately with a clear message if a variable is missing or invalid.
 *
 * Set SKIP_ENV_VALIDATION=1 only for tooling that doesn't need real values
 * (for example a lint-only CI job). Never set it in a running environment.
 */

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url({ message: "DATABASE_URL must be a valid PostgreSQL connection URL" }),
  DIRECT_URL: z.url({ message: "DIRECT_URL must be a valid PostgreSQL connection URL" }),

  // Auth.js
  AUTH_SECRET: z
    .string({ message: "AUTH_SECRET is required (see .env.example for how to generate one)" })
    .min(32, { message: "AUTH_SECRET must be at least 32 characters" }),
  AUTH_URL: z.url().optional(),
  AUTH_TRUST_HOST: z.enum(["true", "false"]).optional(),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),

  // Razorpay (checkout is disabled until all three are set)
  RAZORPAY_KEY_ID: z.string().startsWith("rzp_").optional(),
  RAZORPAY_KEY_SECRET: z.string().min(8).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(8).optional(),
  /** Only for automated tests; leave unset in real use. */
  RAZORPAY_API_BASE: z.url().default("https://api.razorpay.com"),

  // Email via Resend (emails are logged instead of sent until RESEND_API_KEY is set)
  RESEND_API_KEY: z.string().startsWith("re_").optional(),
  EMAIL_FROM: z.string().min(3).default("Jewellery Store <onboarding@resend.dev>"),

  // Product image uploads (Cloudinary). Without these, admins pick from placeholder images.
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  /** Only for automated tests; leave unset in real use. */
  CLOUDINARY_API_BASE: z.url().default("https://api.cloudinary.com"),

  // Business details shown on legal pages, invoices and the footer (required before going live)
  BUSINESS_LEGAL_NAME: z.string().min(2).default("[Your registered business name]"),
  BUSINESS_ADDRESS: z.string().min(5).default("[Registered address, City, State, PIN]"),
  BUSINESS_EMAIL: z.email().default("support@example.com"),
  BUSINESS_PHONE: z.string().min(6).default("[+91 phone number]"),
  BUSINESS_GSTIN: z.string().default("[GSTIN]"),
  /** Seller's state for GST: same state as the buyer → CGST + SGST, otherwise IGST. */
  BUSINESS_STATE: z.enum(INDIAN_STATES).default("Telangana"),
  /** Prefix for invoice numbers, e.g. INV → INV/2026-27/000001 */
  INVOICE_PREFIX: z
    .string()
    .regex(/^[A-Z0-9-]{1,10}$/)
    .default("INV"),
  /** Optional SMS/WhatsApp (MSG91). Off unless FEATURE_SMS=true and the keys are set. */
  FEATURE_SMS: z.enum(["true", "false"]).default("false"),
  MSG91_AUTH_KEY: z.string().min(10).optional(),
  MSG91_ORDER_FLOW_ID: z.string().min(5).optional(),
  GRIEVANCE_OFFICER_NAME: z.string().min(2).default("[Grievance officer name]"),
  GRIEVANCE_OFFICER_EMAIL: z.email().default("grievance@example.com"),

  // Shiprocket (shipping). Without these, admins mark orders shipped by hand.
  SHIPROCKET_EMAIL: z.email().optional(),
  SHIPROCKET_PASSWORD: z.string().min(1).optional(),
  /** Must match a pickup location name in Shiprocket → Settings → Pickup Addresses. */
  SHIPROCKET_PICKUP_LOCATION: z.string().min(1).default("Primary"),
  SHIPROCKET_PICKUP_PINCODE: z
    .string()
    .regex(/^[1-9]\d{5}$/)
    .optional(),
  /** Shiprocket sends this in the x-api-key header of tracking webhooks. */
  SHIPROCKET_WEBHOOK_TOKEN: z.string().min(16).optional(),
  /** Only for automated tests; leave unset in real use. */
  SHIPROCKET_API_BASE: z.url().default("https://apiv2.shiprocket.in"),

  // Shipping fee rule (rupees). Default: free above ₹999, otherwise ₹99.
  SHIPPING_FEE_RUPEES: z.coerce.number().int().min(0).max(10000).default(99),
  FREE_SHIPPING_ABOVE_RUPEES: z.coerce.number().int().min(0).max(10000000).default(999),

  // Scheduled jobs: callers must send "Authorization: Bearer <CRON_SECRET>" (Vercel Cron does this).
  CRON_SECRET: z.string().min(16).optional(),

  // Error tracking (optional)
  SENTRY_DSN: z.url().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default("Jewellery Store"),
});

// NEXT_PUBLIC_* values must be read with literal `process.env.X` so Next.js can inline them.
const rawPublic = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME || undefined,
};

const skipValidation = process.env.SKIP_ENV_VALIDATION === "1";

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

function loadServerEnv(): z.infer<typeof serverSchema> {
  // Server variables are never available in the browser bundle.
  if (typeof window !== "undefined") {
    throw new Error("Server environment variables were accessed on the client.");
  }
  if (skipValidation) return process.env as unknown as z.infer<typeof serverSchema>;

  // Treat empty values (e.g. AUTH_GOOGLE_ID="") as "not set".
  const cleaned = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ""),
  );
  const parsed = serverSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(
      `\n❌ Invalid or missing environment variables:\n${formatIssues(parsed.error)}\n` +
        `Copy .env.example to .env and fill in the values.\n`,
    );
  }
  return parsed.data;
}

function loadPublicEnv(): z.infer<typeof publicSchema> {
  const parsed = publicSchema.safeParse(rawPublic);
  if (!parsed.success) {
    throw new Error(`\n❌ Invalid public environment variables:\n${formatIssues(parsed.error)}\n`);
  }
  return parsed.data;
}

/** Server-only variables. Import only from server code (lib/, services/, route handlers). */
export const env =
  typeof window === "undefined" ? loadServerEnv() : ({} as z.infer<typeof serverSchema>);

/** Google sign-in is turned on only when both Google variables are set. */
export const isGoogleAuthEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);

/** Checkout can take payments only when the Razorpay keys are present. */
export const isRazorpayConfigured = Boolean(
  env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET,
);

export const isShiprocketConfigured = Boolean(
  env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD && env.SHIPROCKET_PICKUP_PINCODE,
);

/** Variables that are safe to use in the browser. */
export const publicEnv = loadPublicEnv();
