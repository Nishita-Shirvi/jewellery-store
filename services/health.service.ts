import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { DeepHealth, HealthResponse } from "@/types/api";

const DB_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Pings the database. `SELECT 1` is the one fixed raw query allowed: it takes no input. */
export async function checkDatabase(): Promise<boolean> {
  try {
    await withTimeout(db.$queryRaw`SELECT 1`, DB_TIMEOUT_MS);
    return true;
  } catch (error) {
    logger.error("health.db_ping_failed", { error });
    return false;
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const dbOk = await checkDatabase();
  return { status: dbOk ? "ok" : "error", db: dbOk ? "ok" : "error" };
}

/**
 * Deeper look for the uptime check and Admin → System (Phase 26): database speed, whether the
 * scheduler is running, stuck or failed jobs, and alerts that are firing. "error" only when the
 * database is down; the rest is reported for whoever is watching to judge.
 */
export async function getDeepHealth(now = new Date()): Promise<DeepHealth> {
  const started = Date.now();
  const dbOk = await checkDatabase();
  const dbMs = Date.now() - started;
  if (!dbOk)
    return {
      status: "error",
      db: "error",
      dbMs,
      cronMinutesAgo: null,
      overdueJobs: 0,
      deadJobs24h: 0,
      firingAlerts: [],
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    };
  const [tick, overdueJobs, deadJobs24h, firing] = await Promise.all([
    db.appSetting.findUnique({ where: { key: "cron.lastTickAt" } }),
    db.job.count({
      where: { status: "PENDING", runAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
    }),
    db.job.count({
      where: { status: "DEAD", finishedAt: { gte: new Date(now.getTime() - 86_400_000) } },
    }),
    db.alertState.findMany({ where: { firing: true }, select: { key: true } }),
  ]);
  const last = typeof tick?.value === "string" ? Date.parse(tick.value) : NaN;
  return {
    status: "ok",
    db: "ok",
    dbMs,
    cronMinutesAgo: Number.isFinite(last) ? Math.floor((now.getTime() - last) / 60_000) : null,
    overdueJobs,
    deadJobs24h,
    firingAlerts: firing.map((f) => f.key),
    release: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
}
