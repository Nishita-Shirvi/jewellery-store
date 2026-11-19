import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import {
  DEFAULT_STOREFRONT,
  storefrontSettingsSchema,
  type StorefrontSettings,
} from "@/lib/validation/storefront";

/**
 * Showroom details the shop team edits in Admin → Settings (address, hours, phone, WhatsApp,
 * map link). Stored as one AppSetting row. Legal/tax details stay in config/business.ini.
 */

const KEY = "storefront";
export const STOREFRONT_TAG = "storefront";

export const getStorefrontSettings = unstable_cache(
  async (): Promise<StorefrontSettings> => {
    const row = await db.appSetting.findUnique({ where: { key: KEY } });
    if (!row) return DEFAULT_STOREFRONT;
    // Validate what's stored: a hand-edited row must never break every page.
    const parsed = storefrontSettingsSchema.safeParse(row.value);
    if (!parsed.success) {
      logger.warn("storefront.invalid_settings_row", { issues: parsed.error.issues.length });
      return DEFAULT_STOREFRONT;
    }
    return { ...DEFAULT_STOREFRONT, ...parsed.data };
  },
  ["storefront:settings:v1"],
  { tags: [STOREFRONT_TAG], revalidate: 3600 },
);

/**
 * The WhatsApp number for every "Chat on WhatsApp" button: the one in Admin → Showroom, else
 * config/customer.ini [support] whatsapp_number. "" when unset or [features] whatsapp_button is off.
 */
export async function whatsappNumber(): Promise<string> {
  if (!config.features.whatsapp_button) return "";
  return (await getStorefrontSettings()).whatsapp || config.support.whatsapp_number;
}

export async function saveStorefrontSettings(settings: StorefrontSettings): Promise<void> {
  await db.appSetting.upsert({
    where: { key: KEY },
    update: { value: settings },
    create: { key: KEY, value: settings },
  });
  revalidateTag(STOREFRONT_TAG);
}
