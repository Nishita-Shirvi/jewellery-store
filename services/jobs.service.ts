import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Background jobs in Postgres (Phase 19) — no Redis, no extra service.
 *
 *  enqueue()      → a row in "Job" (inside the caller's transaction when given one, so the job
 *                   exists if and only if the change that needs it was committed)
 *  kickJobs()     → runs due jobs right after the current response is sent (Next.js after())
 *  runDueJobs()   → also called by the scheduled job (/api/cron/jobs) every few minutes
 *
 * Claiming uses FOR UPDATE SKIP LOCKED: any number of workers can run at once and each job is
 * run by exactly one of them. A job that throws is retried with exponential backoff; after
 * maxAttempts it becomes DEAD and shows up in Admin → Jobs. Handlers must be idempotent (a job
 * can run again after a crash), and every handler in services/job-handlers.ts is.
 *
 * Times in raw SQL are passed as UTC text cast to `timestamp`: Prisma stores DateTime as UTC
 * without a zone, and comparing with NOW() or a timestamptz would use the server's timezone.
 */

type Tx = Prisma.TransactionClient;

/** Thrown by a handler when retrying can't help (bad payload, feature not set up): DEAD at once. */
export class PermanentJobError extends Error {}

export const JOB_TYPES = [
  "email.order",
  "sms.order",
  "invoice.create",
  "shipment.create",
  "webhook.razorpay",
  "webhook.shiprocket",
  "alerts.low_stock",
  "reservations.release",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** A RUNNING job older than this is assumed to belong to a crashed worker and is retried. */
export const STALE_LOCK_MS = 10 * 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;

const utc = (d: Date) => d.toISOString();

/** 30 s, 1 min, 2 min, 4 min … capped at 1 hour. */
export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export async function enqueue(
  type: JobType,
  payload: Prisma.InputJsonValue,
  options: { tx?: Tx; dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<void> {
  const client = options.tx ?? db;
  // skipDuplicates = ON CONFLICT DO NOTHING: an active job with the same key wins quietly,
  // and it never aborts the caller's transaction.
  await client.job.createMany({
    data: [
      {
        type,
        payload,
        dedupeKey: options.dedupeKey,
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? 6,
      },
    ],
    skipDuplicates: true,
  });
}

interface ClaimedJob {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  attempts: number;
  maxAttempts: number;
}

/** Moves crashed workers' jobs back to PENDING. */
async function recoverStale(now: Date) {
  const cutoff = new Date(now.getTime() - STALE_LOCK_MS);
  const n = await db.$executeRaw`
    UPDATE "Job" SET "status" = 'PENDING', "lockedAt" = NULL, "updatedAt" = ${utc(now)}::timestamp,
           "lastError" = COALESCE("lastError", 'Worker stopped while running this job')
     WHERE "status" = 'RUNNING' AND "lockedAt" < ${utc(cutoff)}::timestamp`;
  if (n > 0) logger.warn("jobs.stale_recovered", { count: n });
}

async function claim(now: Date, limit: number, onlyId?: string): Promise<ClaimedJob[]> {
  return db.$queryRaw<ClaimedJob[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = ${utc(now)}::timestamp,
           "attempts" = "attempts" + 1, "updatedAt" = ${utc(now)}::timestamp
     WHERE "id" IN (
       SELECT "id" FROM "Job"
        WHERE "status" = 'PENDING' AND "runAt" <= ${utc(now)}::timestamp
          ${onlyId ? Prisma.sql`AND "id" = ${onlyId}` : Prisma.empty}
        ORDER BY "runAt", "createdAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

async function finish(job: ClaimedJob, error: unknown) {
  const now = new Date();
  if (!error) {
    await db.job.update({
      where: { id: job.id },
      data: { status: "DONE", finishedAt: now, lockedAt: null, dedupeKey: null, lastError: null },
    });
    return "done" as const;
  }
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  if (job.attempts >= job.maxAttempts || error instanceof PermanentJobError) {
    await db.job.update({
      where: { id: job.id },
      data: {
        status: "DEAD",
        finishedAt: now,
        lockedAt: null,
        dedupeKey: null,
        lastError: message,
      },
    });
    logger.error("jobs.dead", {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      error: message,
    });
    return "dead" as const;
  }
  await db.job.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      lockedAt: null,
      lastError: message,
      runAt: new Date(now.getTime() + backoffMs(job.attempts)),
    },
  });
  logger.warn("jobs.retry_scheduled", {
    jobId: job.id,
    type: job.type,
    attempts: job.attempts,
    error: message,
  });
  return "retry" as const;
}

async function execute(job: ClaimedJob) {
  const { runJobHandler } = await import("@/services/job-handlers");
  let error: unknown = null;
  try {
    await runJobHandler(job.type, job.payload);
  } catch (e) {
    error = e ?? new Error("Job failed");
  }
  return finish(job, error);
}

export interface RunSummary {
  done: number;
  retry: number;
  dead: number;
}

/** Runs due jobs until none are left, `limit` were run, or the time budget is used up. */
export async function runDueJobs(
  options: { limit?: number; budgetMs?: number; batch?: number } = {},
): Promise<RunSummary> {
  const limit = options.limit ?? 50;
  const deadline = Date.now() + (options.budgetMs ?? 20_000);
  const summary: RunSummary = { done: 0, retry: 0, dead: 0 };
  await recoverStale(new Date());
  let ran = 0;
  while (ran < limit && Date.now() < deadline) {
    const jobs = await claim(new Date(), Math.min(options.batch ?? 5, limit - ran));
    if (jobs.length === 0) break;
    for (const job of jobs) {
      summary[await execute(job)]++;
      ran++;
    }
  }
  if (ran > 0) logger.info("jobs.run", { ...summary });
  return summary;
}

/** Runs one specific job now (if it's due and nobody else has it). Used for admin buttons. */
export async function runJobNow(jobId: string) {
  const [job] = await claim(new Date(), 1, jobId);
  return job ? execute(job) : ("busy" as const);
}

/**
 * Runs due jobs after the response has been sent, so customers never wait for emails, PDFs
 * or Shiprocket. Outside a request (tests, scripts) this does nothing; the cron picks them up.
 */
export async function kickJobs(): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(() =>
      runDueJobs({ limit: 20, budgetMs: 15_000 }).catch((error) =>
        logger.error("jobs.kick_failed", { error }),
      ),
    );
  } catch {
    /* not inside a request */
  }
}

// ───────────────────────── admin ─────────────────────────

export async function jobOverview() {
  const [counts, dead, failing] = await Promise.all([
    db.job.groupBy({ by: ["status"], _count: true }),
    db.job.findMany({
      where: { status: "DEAD" },
      orderBy: { finishedAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        attempts: true,
        lastError: true,
        finishedAt: true,
        payload: true,
      },
    }),
    db.job.findMany({
      where: { status: "PENDING", attempts: { gt: 0 } },
      orderBy: { runAt: "asc" },
      take: 50,
      select: {
        id: true,
        type: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        runAt: true,
      },
    }),
  ]);
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<
      Record<"PENDING" | "RUNNING" | "DONE" | "DEAD", number>
    >,
    dead,
    failing,
  };
}

/** Puts a DEAD job back in the queue with a fresh set of attempts. */
export async function retryDeadJob(jobId: string): Promise<boolean> {
  const res = await db.job.updateMany({
    where: { id: jobId, status: "DEAD" },
    data: { status: "PENDING", attempts: 0, runAt: new Date(), finishedAt: null },
  });
  return res.count === 1;
}

/** Deletes finished jobs older than `days` (keeps the table small). DEAD jobs are kept. */
export async function pruneDoneJobs(days = 30) {
  const res = await db.job.deleteMany({
    where: { status: "DONE", finishedAt: { lt: new Date(Date.now() - days * 86_400_000) } },
  });
  return res.count;
}

/**
 * Queues a job and runs it straight away (for admin buttons that want an answer now). If it
 * fails it stays queued and is retried automatically. A second click while it's queued or
 * running doesn't add another job.
 */
export async function enqueueAndRunNow(
  type: JobType,
  payload: Prisma.InputJsonValue,
  dedupeKey: string,
): Promise<{ outcome: "done" | "retry" | "dead" | "busy"; error: string | null }> {
  await enqueue(type, payload, { dedupeKey });
  const job = await db.job.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (!job) return { outcome: "done", error: null }; // finished in the meantime
  const outcome = await runJobNow(job.id);
  const after = await db.job.findUnique({ where: { id: job.id }, select: { lastError: true } });
  return { outcome, error: outcome === "done" ? null : (after?.lastError ?? null) };
}
