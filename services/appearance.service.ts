import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_HERO,
  liveTheme,
  todayInIndia,
  type Appearance,
  type Theme,
} from "@/lib/appearance";
import { storedAppearanceSchema, themeSchema } from "@/lib/validation/appearance";

/**
 * Admin → Appearance: festival themes and the light/dark default, stored as one AppSetting row.
 * Read on every page (cached; saving clears the cache). A bad or missing row never breaks the
 * shop: it falls back to the built-in Everyday theme.
 */

const KEY = "appearance";
export const APPEARANCE_TAG = "appearance";

export class AppearanceReadError extends Error {}

/**
 * Straight from the database, for admin edits (never from the cache). Themes are checked for
 * shape only, so one whose photo link stopped passing is still listed and kept. A row that
 * can't be read at all throws, so no save can overwrite it with the defaults.
 */
export async function loadAppearance(): Promise<Appearance> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_APPEARANCE;
  const parsed = storedAppearanceSchema.safeParse(row.value);
  if (!parsed.success) {
    logger.error("appearance.unreadable_row", { issues: parsed.error.issues.length });
    throw new AppearanceReadError(
      'The saved appearance settings can\'t be read, so nothing was changed. Ask the developer to check the "appearance" setting.',
    );
  }
  return parsed.data as Appearance;
}

/**
 * What the shop may show: themes whose photos and videos are still on our storage. A festival
 * theme that fails is skipped; Everyday falls back to the built-in photo.
 */
export function forShop(appearance: Appearance): Appearance {
  const themes = appearance.themes.flatMap((t): Theme[] => {
    if (themeSchema.safeParse(t).success) return [t];
    logger.warn("appearance.theme_hidden", { themeId: t.id });
    return t.isDefault ? [{ ...t, hero: DEFAULT_HERO }] : [];
  });
  return { ...appearance, themes };
}

const getAppearanceCached = unstable_cache(
  async (): Promise<Appearance> => {
    try {
      return forShop(await loadAppearance());
    } catch (error) {
      if (error instanceof AppearanceReadError) return DEFAULT_APPEARANCE;
      throw error;
    }
  },
  ["appearance:v1"],
  { tags: [APPEARANCE_TAG], revalidate: 3600 },
);

/** For the shop: cached, and the built-in default when the database can't be reached. */
export async function getAppearanceSafe(): Promise<Appearance> {
  return getAppearanceCached().catch((error) => {
    logger.error("appearance.read_failed", { error });
    return DEFAULT_APPEARANCE;
  });
}

/** The theme shoppers see right now (India date). */
export async function getLiveTheme(now = new Date()): Promise<Theme> {
  return liveTheme(await getAppearanceSafe(), todayInIndia(now));
}

/** Saves the whole appearance. Callers check the theme they changed with the strict schema. */
export async function saveAppearance(appearance: Appearance): Promise<void> {
  const value = storedAppearanceSchema.parse(appearance);
  await db.appSetting.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  });
  revalidateTag(APPEARANCE_TAG);
}
