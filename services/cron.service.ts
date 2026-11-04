import "server-only";
import { logger } from "@/lib/logger";
import { enqueue, pruneDoneJobs, runDueJobs } from "@/services/jobs.service";
import { recoIsDue } from "@/services/reco.service";
import { db } from "@/lib/db";
import { pruneMetrics } from "@/lib/metrics";
import { evaluateAlerts } from "@/services/monitor.service";
import { purgeIsDue, purgeOldData } from "@/services/privacy.service";

/** AppSetting key holding the last cron tick (Admin → System, /api/health). */
export const CRON_TICK_KEY = "cron.lastTickAt";

/**
 * One tick of the scheduler (Phase 19): queue the periodic work, then run whatever is due —
 * including retries of anything that failed earlier. Called by Vercel Cron and the GitHub
 * Actions schedule (.github/workflows/cron.yml). Safe to call as often as you like.
 */
export async function cronTick(extra: { lowStock?: boolean } = {}) {
  // Active-only dedupe keys: a tick never queues a second copy while one is waiting.
  await enqueue("reservations.release", {}, { dedupeKey: "reservations:release", maxAttempts: 3 });
  if (extra.lowStock) await enqueue("alerts.low_stock", {}, { dedupeKey: "alerts:low-stock" });
  // Cart reminders, back-in-stock emails, referral rewards (Phase 20).
  await enqueue("marketing.scan", {}, { dedupeKey: "marketing:scan", maxAttempts: 3 });
  // Recommendations (Phase 25): once a day — whichever tick first finds the last run > 20 h old.
  if (await recoIsDue())
    await enqueue("reco.compute", {}, { dedupeKey: "reco:compute", maxAttempts: 3 });
  const summary = await runDueJobs({ limit: 100, budgetMs: 45_000 });
  const pruned = await pruneDoneJobs(30);
  // Monitoring (Phase 26): business alerts, last-tick time for the health page, old counters.
  const alerts = await evaluateAlerts().catch((error) => {
    logger.error("cron.alerts_failed", { error });
    return [];
  });
  await pruneMetrics(3);
  // Privacy (Phase 27): delete data no longer needed, once a day.
  if (await purgeIsDue())
    await purgeOldData().catch((error) => logger.error("cron.purge_failed", { error }));
  await db.appSetting.upsert({
    where: { key: CRON_TICK_KEY },
    create: { key: CRON_TICK_KEY, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
  if (alerts.length)
    logger.info("cron.alert_changes", { changes: alerts.map((a) => `${a.key}:${a.change}`) });
  logger.info("cron.tick", { ...summary, pruned });
  return { ...summary, pruned };
}
