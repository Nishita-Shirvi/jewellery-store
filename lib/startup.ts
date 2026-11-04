import { getBusiness } from "@/lib/business";
import { config, envOverrides } from "@/lib/config";
import { env, isGoogleAuthEnabled, isRazorpayConfigured, isShiprocketConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Which integrations are switched on (yes/no only, never secrets). Also on Admin → System. */
export function integrationsSummary() {
  return {
    razorpay: isRazorpayConfigured,
    razorpayMode: env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")
      ? ("live" as const)
      : ("test" as const),
    email: Boolean(env.RESEND_API_KEY),
    imageUploads: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY),
    shiprocket: isShiprocketConfigured,
    googleLogin: isGoogleAuthEnabled,
    sms: config.features.sms && Boolean(env.MSG91_AUTH_KEY),
    sentry: Boolean(env.SENTRY_DSN),
    cronJobs: Boolean(env.CRON_SECRET),
    chatAlerts: Boolean(env.ALERT_WEBHOOK_URL),
    // Phase 27: phone numbers and addresses use their own key (else derived from AUTH_SECRET).
    piiKey: Boolean(env.PII_ENCRYPTION_KEY),
  };
}

/**
 * One log line when the server starts, saying which integrations are switched on.
 * First thing to check when "emails aren't sending" or "checkout says payments not set up":
 * search the logs for event "app.start". Shows only yes/no, never secret values.
 */
export function logStartupSummary() {
  logger.info("app.start", {
    nodeEnv: env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV ?? "local",
    logLevel: config.logging.level,
    // Env vars overriding config.ini — if you edited config.ini and nothing changed, look here.
    configOverriddenByEnv: envOverrides(),
    integrations: integrationsSummary(),
    shipping: config.shipping,
    inventory: config.inventory,
  });

  if (env.NODE_ENV === "production" && !env.PII_ENCRYPTION_KEY) {
    logger.warn("app.pii_key_missing", {
      hint: "Set PII_ENCRYPTION_KEY (customer addresses are encrypted with a key derived from AUTH_SECRET until then).",
    });
  }
  if (env.NODE_ENV === "production" && getBusiness().incomplete) {
    logger.warn("app.business_details_incomplete", {
      hint: "Fill in [business] and [grievance_officer] in config.ini before taking real orders.",
    });
  }
}
