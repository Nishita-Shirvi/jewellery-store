import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 19 — the job queue against real PostgreSQL. The handlers are replaced by a fake that
 * counts runs and fails on demand, so the queue mechanics are tested on their own.
 * (This test database runs on India time: a timezone mistake in the queue's SQL would show up
 * as jobs running hours early or late.)
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const runs = vi.hoisted(() => new Map<string, number>());
const behaviour = vi.hoisted(() => ({
  failFor: new Set<string>(),
  permanentFor: new Set<string>(),
  slowMs: 0,
  /** When set, the handler waits until it's resolved (lets a test hold a job "running"). */
  gate: null as Promise<void> | null,
}));
vi.mock("@/services/job-handlers", async () => {
  const { PermanentJobError } = await import("@/services/jobs.service");
  return {
    runJobHandler: async (_type: string, payload: { key: string }) => {
      runs.set(payload.key, (runs.get(payload.key) ?? 0) + 1);
      if (behaviour.slowMs) await new Promise((r) => setTimeout(r, behaviour.slowMs));
      if (behaviour.gate) await behaviour.gate;
      if (behaviour.permanentFor.has(payload.key)) throw new PermanentJobError("can't ever work");
      if (behaviour.failFor.has(payload.key)) throw new Error(`boom ${payload.key}`);
    },
  };
});

const { db } = await import("@/lib/db");
const jobs = await import("@/services/jobs.service");
const { recordWebhook } = await import("@/services/webhook.service");

const RUN = `job${Date.now().toString(36)}`;
let n = 0;
const key = () => `${RUN}-${++n}`;
const jobFor = (k: string) =>
  db.job.findFirstOrThrow({ where: { payload: { path: ["key"], equals: k } } });

beforeEach(async () => {
  runs.clear();
  behaviour.failFor.clear();
  behaviour.permanentFor.clear();
  behaviour.slowMs = 0;
  behaviour.gate = null;
  // Only this file's jobs exist while it runs: older leftovers would be picked up by runDueJobs.
  await db.job.deleteMany({});
});
afterAll(async () => {
  await db.job.deleteMany({});
  await db.webhookEvent.deleteMany({ where: { eventId: { startsWith: RUN } } });
  await db.$disconnect();
});

describe("queueing", () => {
  it("a job queued inside a transaction that rolls back never exists", async () => {
    const k = key();
    await expect(
      db.$transaction(async (tx) => {
        await jobs.enqueue("email.order", { key: k }, { tx });
        throw new Error("payment failed");
      }),
    ).rejects.toThrow("payment failed");
    expect(await db.job.count({ where: { payload: { path: ["key"], equals: k } } })).toBe(0);
  });

  it("a second job with the same key is dropped while the first is waiting, allowed once it's done", async () => {
    const k = key();
    await Promise.all([
      jobs.enqueue("email.order", { key: k }, { dedupeKey: k }),
      jobs.enqueue("email.order", { key: k }, { dedupeKey: k }),
      jobs.enqueue("email.order", { key: k }, { dedupeKey: k }),
    ]);
    expect(await db.job.count({ where: { dedupeKey: k } })).toBe(1);
    await jobs.runDueJobs();
    expect(runs.get(k)).toBe(1);
    await jobs.enqueue("email.order", { key: k }, { dedupeKey: k });
    await jobs.runDueJobs();
    expect(runs.get(k)).toBe(2);
  });

  it("a duplicate key inside a transaction doesn't abort the transaction", async () => {
    const k = key();
    await jobs.enqueue("email.order", { key: k }, { dedupeKey: k });
    await db.$transaction(async (tx) => {
      await jobs.enqueue("email.order", { key: k }, { tx, dedupeKey: k });
      await tx.job.count(); // the transaction is still usable
    });
    expect(await db.job.count({ where: { dedupeKey: k } })).toBe(1);
  });
});

describe("running", () => {
  it("6 workers at once, 30 jobs → every job runs exactly once", async () => {
    const keys = Array.from({ length: 30 }, key);
    for (const k of keys) await jobs.enqueue("email.order", { key: k });
    behaviour.slowMs = 5;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => jobs.runDueJobs({ limit: 30, batch: 3 })),
    );
    expect(results.reduce((s, r) => s + r.done, 0)).toBe(30);
    for (const k of keys) expect(runs.get(k)).toBe(1);
    expect(await db.job.count({ where: { status: "DONE" } })).toBe(30);
  });

  it("a job due in the future isn't run early (timezone-safe), and runs once due", async () => {
    const k = key();
    await jobs.enqueue("email.order", { key: k }, { runAt: new Date(Date.now() + 60 * 60_000) });
    await jobs.runDueJobs();
    expect(runs.get(k)).toBeUndefined();
    await db.job.updateMany({
      where: { status: "PENDING" },
      data: { runAt: new Date(Date.now() - 1000) },
    });
    await jobs.runDueJobs();
    expect(runs.get(k)).toBe(1);
  });

  it("a failing job is retried later with growing waits, then gives up as DEAD", async () => {
    const k = key();
    behaviour.failFor.add(k);
    await jobs.enqueue("email.order", { key: k }, { dedupeKey: k, maxAttempts: 3 });

    await jobs.runDueJobs();
    let job = await jobFor(k);
    expect(job).toMatchObject({ status: "PENDING", attempts: 1, lastError: `boom ${k}` });
    const wait1 = job.runAt.getTime() - Date.now();
    expect(wait1).toBeGreaterThan(20_000); // ~30 s, not run again straight away
    await jobs.runDueJobs();
    expect(runs.get(k)).toBe(1);

    for (const attempt of [2, 3]) {
      await db.job.update({ where: { id: job.id }, data: { runAt: new Date(Date.now() - 1000) } });
      await jobs.runDueJobs();
      job = await jobFor(k);
      expect(job.attempts).toBe(attempt);
    }
    expect(job.status).toBe("DEAD");
    expect(job.dedupeKey).toBeNull(); // the same work can be queued again
    expect(jobs.backoffMs(1)).toBe(30_000);
    expect(jobs.backoffMs(2)).toBe(60_000);
    expect(jobs.backoffMs(20)).toBe(60 * 60_000);
  });

  it("'retrying won't help' errors go straight to DEAD", async () => {
    const k = key();
    behaviour.permanentFor.add(k);
    await jobs.enqueue("email.order", { key: k });
    await jobs.runDueJobs();
    expect(await jobFor(k)).toMatchObject({ status: "DEAD", attempts: 1 });
  });

  it("admin retry: a DEAD job gets fresh attempts and runs; retrying twice queues it once", async () => {
    const k = key();
    behaviour.permanentFor.add(k);
    await jobs.enqueue("email.order", { key: k });
    await jobs.runDueJobs();
    const dead = await jobFor(k);
    behaviour.permanentFor.clear();
    const [a, b] = await Promise.all([jobs.retryDeadJob(dead.id), jobs.retryDeadJob(dead.id)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    await jobs.runDueJobs();
    expect(await jobFor(k)).toMatchObject({ status: "DONE", attempts: 1 });
    expect(runs.get(k)).toBe(2);
  });

  it("a job left RUNNING by a crashed worker is picked up again", async () => {
    const k = key();
    await jobs.enqueue("email.order", { key: k });
    const job = await jobFor(k);
    await db.job.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        attempts: 1,
        lockedAt: new Date(Date.now() - jobs.STALE_LOCK_MS - 60_000),
      },
    });
    await jobs.runDueJobs();
    expect(await jobFor(k)).toMatchObject({ status: "DONE", attempts: 2 });
  });

  it("a RUNNING job that isn't stale is left alone", async () => {
    const k = key();
    await jobs.enqueue("email.order", { key: k });
    const job = await jobFor(k);
    await db.job.update({
      where: { id: job.id },
      data: { status: "RUNNING", lockedAt: new Date() },
    });
    await jobs.runDueJobs();
    expect(runs.get(k)).toBeUndefined();
  });

  it("button jobs: a second click while running doesn't run the work twice", async () => {
    const k = key();
    // Hold the first run open until the second click has been answered (no timing guesswork).
    let release!: () => void;
    behaviour.gate = new Promise<void>((r) => (release = r));
    const first = jobs.enqueueAndRunNow("shipment.create", { key: k }, `ship:${k}`);
    for (let i = 0; i < 200 && !runs.get(k); i++) await new Promise((r) => setTimeout(r, 10));
    expect(runs.get(k)).toBe(1); // first is running now
    const second = await jobs.enqueueAndRunNow("shipment.create", { key: k }, `ship:${k}`);
    expect(second.outcome).toBe("busy");
    release();
    expect((await first).outcome).toBe("done");
    expect(runs.get(k)).toBe(1);
    // A click AFTER it finished is a new request and runs again (e.g. retry after a failure).
    behaviour.gate = null;
    expect((await jobs.enqueueAndRunNow("shipment.create", { key: k }, `ship:${k}`)).outcome).toBe(
      "done",
    );
    expect(runs.get(k)).toBe(2);
  });

  it("old finished jobs are pruned; failed ones are kept", async () => {
    const k1 = key();
    const k2 = key();
    behaviour.permanentFor.add(k2);
    await jobs.enqueue("email.order", { key: k1 });
    await jobs.enqueue("email.order", { key: k2 });
    await jobs.runDueJobs();
    await db.job.updateMany({ data: { finishedAt: new Date(Date.now() - 40 * 86_400_000) } });
    expect(await jobs.pruneDoneJobs(30)).toBe(1);
    expect(await db.job.count()).toBe(1);
  });
});

describe("webhooks are saved once and queued once", () => {
  it("the same event delivered 5 times at once → 1 saved event, 1 job", async () => {
    const eventId = `${RUN}-evt`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        recordWebhook({
          provider: "razorpay",
          eventId,
          eventType: "payment.captured",
          payload: { key: eventId },
        }),
      ),
    );
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(await db.webhookEvent.count({ where: { eventId } })).toBe(1);
    expect(await db.job.count({ where: { type: "webhook.razorpay" } })).toBe(1);
  });

  it("the same id from different providers are different events", async () => {
    const eventId = `${RUN}-shared`;
    await recordWebhook({ provider: "razorpay", eventId, eventType: "x", payload: {} });
    const r = await recordWebhook({ provider: "shiprocket", eventId, eventType: "x", payload: {} });
    expect(r.duplicate).toBe(false);
  });
});
