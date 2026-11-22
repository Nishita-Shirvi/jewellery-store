import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { DEFAULT_ENTRANCE, type EntranceSettings } from "@/lib/entrance";
import { logger } from "@/lib/logger";
import { entranceSchema, storedEntranceSchema } from "@/lib/validation/entrance";

/** Admin → Appearance → Sign-in & top bar, stored as one AppSetting row. */

const KEY = "entrance";
export const ENTRANCE_TAG = "entrance";

/** Straight from the database, for admin edits. */
export async function loadEntrance(): Promise<EntranceSettings> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_ENTRANCE;
  const parsed = storedEntranceSchema.safeParse(row.value);
  if (!parsed.success) {
    logger.warn("entrance.invalid_row", { issues: parsed.error.issues.length });
    return DEFAULT_ENTRANCE;
  }
  return parsed.data;
}

const getEntranceCached = unstable_cache(loadEntrance, ["entrance:v1"], {
  tags: [ENTRANCE_TAG],
  revalidate: 3600,
});

/**
 * For shop pages. Never throws: if the database is unreachable, or a stored link no longer
 * passes our storage check, the shop falls back to the defaults (our own video and still).
 */
export async function getEntrance(): Promise<EntranceSettings> {
  const s = await getEntranceCached().catch((error) => {
    logger.error("entrance.read_failed", { error });
    return DEFAULT_ENTRANCE;
  });
  if (entranceSchema.safeParse(s).success) return s;
  return { ...s, videoUrl: DEFAULT_ENTRANCE.videoUrl, poster: DEFAULT_ENTRANCE.poster };
}

export async function saveEntrance(s: EntranceSettings): Promise<void> {
  const value = storedEntranceSchema.parse(s);
  await db.appSetting.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  });
  revalidateTag(ENTRANCE_TAG);
}
