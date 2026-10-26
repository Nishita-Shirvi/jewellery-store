import "server-only";
import { config } from "@/lib/config";
import { publicEnv } from "@/lib/env";

/** Business details used on legal pages and invoices. Set them in config.ini before going live. */
export function getBusiness() {
  const { business, grievance_officer: grievance } = config;
  return {
    storeName: publicEnv.NEXT_PUBLIC_SITE_NAME,
    siteUrl: publicEnv.NEXT_PUBLIC_APP_URL,
    legalName: business.legal_name,
    address: business.address,
    email: business.email,
    phone: business.phone,
    gstin: business.gstin,
    state: business.state,
    grievanceName: grievance.name,
    grievanceEmail: grievance.email,
    /** True while any value is still a [placeholder]. */
    incomplete:
      [business.legal_name, business.address, business.phone, business.gstin, grievance.name].some(
        (v) => v.startsWith("["),
      ) || business.email.endsWith("@example.com"),
  };
}

export const POLICY_LAST_UPDATED = "9 October 2026";
