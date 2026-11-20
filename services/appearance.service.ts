import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  DEFAULT_APPEARANCE,
  liveTheme,
  todayInIndia,
  type Appearance,
  type Theme,
} from "@/lib/appearance";
import { appearanceSchema } from "@/lib/validation/appearance";

/**
 * Admin → Appearance: festival themes and the light/dark default, stored as one AppSetting row.
 * Read on every page (cached; saving clears the cache). A bad or missing row never breaks the
 * shop: it falls back to the built-in Everyday theme.
 */

const KEY = "appearance";
export const APPEARANCE_TAG = "appearance";

/** Straight from the database (admin edits start from this, never from the cache). */
export async function loadAppearance(): Promise<Appearance> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_APPEARANCE;
  const parsed = appearanceSchema.safeParse(row.value);
  if (!parsed.success) {
    logger.warn("appearance.invalid_row", { issues: parsed.error.issues.length });
    return DEFAULT_APPEARANCE;
  }
  return parsed.data as Appearance;
}

export const getAppearance = unstable_cache(loadAppearance, ["appearance:v1"], {
  tags: [APPEARANCE_TAG],
  revalidate: 3600,
});

/** The appearance, or the built-in default when the database can't be reached. */
export async function getAppearanceSafe(): Promise<Appearance> {
  return getAppearance().catch((error) => {
    logger.error("appearance.read_failed", { error });
    return DEFAULT_APPEARANCE;
  });
}

/** The theme shoppers see right now (India date). */
export async function getLiveTheme(now = new Date()): Promise<Theme> {
  return liveTheme(await getAppearanceSafe(), todayInIndia(now));
}

export async function saveAppearance(appearance: Appearance): Promise<void> {
  // Validated again here so no caller can store something the shop can't read back.
  const value = appearanceSchema.parse(appearance);
  await db.appSetting.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  });
  revalidateTag(APPEARANCE_TAG);
}
