import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { HealthResponse } from "@/types/api";

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
