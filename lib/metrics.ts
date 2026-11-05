import "server-only";
import { db } from "@/lib/db";

/**
 * Per-minute counters (Phase 26) for alerts: "payments.gateway_error", "webhook.bad_signature",
 * "log.error"… One upsert per call; callers that can fire very often batch first (see logger).
 * Never throws — a metric must never break the thing it measures.
 */
export const METRIC_KEYS = [
  "payments.gateway_error",
  "webhook.bad_signature",
  "log.error",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

const minuteOf = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

export async function addMetric(key: MetricKey, n = 1, now = new Date()): Promise<void> {
  if (n <= 0) return;
  try {
    // Plain UTC timestamp, like every other column (Prisma stores times without a zone).
    await db.$executeRaw`
      INSERT INTO "Metric" ("key", "minute", "count")
      VALUES (${key}, ${minuteOf(now).toISOString()}::timestamp, ${n})
      ON CONFLICT ("key", "minute") DO UPDATE SET "count" = "Metric"."count" + EXCLUDED."count"`;
  } catch {
    /* stats only */
  }
}

/** Sum of a counter over the last `minutes` minutes (including the current one). */
export async function sumMetric(
  key: MetricKey,
  minutes: number,
  now = new Date(),
): Promise<number> {
  const since = new Date(minuteOf(now).getTime() - (minutes - 1) * 60_000);
  const r = await db.metric.aggregate({
    where: { key, minute: { gte: since } },
    _sum: { count: true },
  });
  return r._sum.count ?? 0;
}

/** Drops counters older than `days` (run by the cron). */
export async function pruneMetrics(days = 3, now = new Date()) {
  const r = await db.metric.deleteMany({
    where: { minute: { lt: new Date(now.getTime() - days * 86_400_000) } },
  });
  return r.count;
}
