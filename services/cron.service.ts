import "server-only";
import { logger } from "@/lib/logger";
import { enqueue, pruneDoneJobs, runDueJobs } from "@/services/jobs.service";

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
  const summary = await runDueJobs({ limit: 100, budgetMs: 45_000 });
  const pruned = await pruneDoneJobs(30);
  logger.info("cron.tick", { ...summary, pruned });
  return { ...summary, pruned };
}
