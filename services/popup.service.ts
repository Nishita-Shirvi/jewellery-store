import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DEFAULT_POPUP, popupLive, type PopupSettings } from "@/lib/popup";
import { todayInIndia } from "@/lib/appearance";
import { popupSchema, storedPopupSchema } from "@/lib/validation/popup";

/** Admin → Appearance → Popup, stored as one AppSetting row. Off until an admin turns it on. */

const KEY = "popup";
export const POPUP_TAG = "popup";

/** Straight from the database, for admin edits. */
export async function loadPopup(): Promise<PopupSettings> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_POPUP;
  const parsed = storedPopupSchema.safeParse(row.value);
  if (!parsed.success) {
    logger.warn("popup.invalid_row", { issues: parsed.error.issues.length });
    return DEFAULT_POPUP;
  }
  return parsed.data as PopupSettings;
}

const getPopupCached = unstable_cache(loadPopup, ["popup:v1"], {
  tags: [POPUP_TAG],
  revalidate: 3600,
});

/** The popup to offer shoppers today, or null (off, out of its dates, or its picture fails). */
export async function getLivePopup(now = new Date()): Promise<PopupSettings | null> {
  const popup = await getPopupCached().catch((error) => {
    logger.error("popup.read_failed", { error });
    return null;
  });
  if (!popup || !popupLive(popup, todayInIndia(now))) return null;
  // Visit requests need the booking feature (config/features.ini).
  if (popup.action === "visit" && !config.features.visit_booking) return null;
  return popupSchema.safeParse(popup).success ? popup : null;
}

export async function savePopup(popup: PopupSettings): Promise<void> {
  const value = storedPopupSchema.parse(popup);
  await db.appSetting.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  });
  revalidateTag(POPUP_TAG);
}
