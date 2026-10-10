import "server-only";
import { env, publicEnv } from "@/lib/env";

/** Business details used on legal pages. Set them in .env before going live. */
export function getBusiness() {
  return {
    storeName: publicEnv.NEXT_PUBLIC_SITE_NAME,
    siteUrl: publicEnv.NEXT_PUBLIC_APP_URL,
    legalName: env.BUSINESS_LEGAL_NAME,
    address: env.BUSINESS_ADDRESS,
    email: env.BUSINESS_EMAIL,
    phone: env.BUSINESS_PHONE,
    gstin: env.BUSINESS_GSTIN,
    grievanceName: env.GRIEVANCE_OFFICER_NAME,
    grievanceEmail: env.GRIEVANCE_OFFICER_EMAIL,
    /** True while any value is still a [placeholder]. */
    incomplete:
      [
        env.BUSINESS_LEGAL_NAME,
        env.BUSINESS_ADDRESS,
        env.BUSINESS_PHONE,
        env.BUSINESS_GSTIN,
        env.GRIEVANCE_OFFICER_NAME,
      ].some((v) => v.startsWith("[")) || env.BUSINESS_EMAIL.endsWith("@example.com"),
  };
}

export const POLICY_LAST_UPDATED = "9 October 2026";
