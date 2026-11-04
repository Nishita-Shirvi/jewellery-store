import "server-only";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sumMetric } from "@/lib/metrics";
import { PAID_STATUSES } from "@/lib/order-status";
import { availableStock } from "@/services/inventory.service";

/**
 * Business alerts (Phase 26). Each check looks at the database and says "firing or not, and
 * why". State lives in AlertState, so whoever runs the checks — the cron every few minutes, or
 * a payment failure as it happens — an alert emails once when it starts, reminds every
 * `repeat_hours` while it lasts, and emails "resolved" when it clears. Conditional updates
 * guarantee one email even if two checks run at the same moment.
 *
 * Every alert has a section in Docs/RUNBOOK.md (the email links to it).
 */
export const ALERTS = {
  payments: { title: "Payments are failing", runbook: "payments-are-failing" },
  no_orders: { title: "No orders for a long time", runbook: "no-orders-for-a-long-time" },
  dead_jobs: { title: "Background jobs have failed", runbook: "background-jobs-have-failed" },
  webhooks: { title: "Webhook problems", runbook: "webhook-problems" },
  stockouts: { title: "Best-sellers out of stock", runbook: "best-sellers-out-of-stock" },
  error_spike: { title: "Many errors", runbook: "many-errors" },
} as const;
export type AlertKey = keyof typeof ALERTS;
export const ALERT_KEYS = Object.keys(ALERTS) as AlertKey[];

export interface CheckResult {
  firing: boolean;
  detail: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const SOLD = ["CONFIRMED", ...PAID_STATUSES] as const;

// ───────────────────────── checks ─────────────────────────

export async function checkPayments(now = new Date()): Promise<CheckResult> {
  const a = config.alerts;
  if (a.payment_failures_min === 0) return { firing: false, detail: "Off" };
  const since = new Date(now.getTime() - a.payment_window_minutes * MIN);
  const [gateway, failed, captured] = await Promise.all([
    sumMetric("payments.gateway_error", a.payment_window_minutes, now),
    db.payment.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
    db.payment.count({ where: { status: "CAPTURED", updatedAt: { gte: since } } }),
  ]);
  const bad = gateway + failed;
  const rate = bad + captured > 0 ? Math.round((bad * 100) / (bad + captured)) : 0;
  const detail = `Last ${a.payment_window_minutes} min: ${gateway} gateway error(s), ${failed} failed and ${captured} successful payment(s) (${rate}% failing).`;
  return {
    firing: bad >= a.payment_failures_min && rate >= a.payment_failure_rate_percent,
    detail,
  };
}

export async function checkNoOrders(now = new Date()): Promise<CheckResult> {
  const hours = config.alerts.no_orders_hours;
  if (hours === 0) return { firing: false, detail: "Off" };
  const last = await db.order.findFirst({
    where: { status: { in: [...SOLD] } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  // A store that has never taken an order isn't "down" — nothing to compare with yet.
  if (!last) return { firing: false, detail: "No orders yet." };
  const ageHours = Math.floor((now.getTime() - last.createdAt.getTime()) / HOUR);
  return {
    firing: ageHours >= hours,
    detail: `Last order ${ageHours} hour(s) ago (alert after ${hours}).`,
  };
}

export async function checkDeadJobs(now = new Date()): Promise<CheckResult> {
  const since = new Date(now.getTime() - 24 * HOUR);
  const dead = await db.job.groupBy({
    by: ["type"],
    where: { status: "DEAD", finishedAt: { gte: since } },
    _count: true,
  });
  const total = dead.reduce((s, d) => s + d._count, 0);
  return {
    firing: total > 0,
    detail: total
      ? `${total} job(s) gave up in the last 24 h: ${dead.map((d) => `${d.type} ×${d._count}`).join(", ")}.`
      : "No failed jobs in the last 24 h.",
  };
}

export async function checkWebhooks(now = new Date()): Promise<CheckResult> {
  const since = new Date(now.getTime() - HOUR);
  const [failing, badSignatures] = await Promise.all([
    db.job.count({
      where: {
        type: { startsWith: "webhook." },
        updatedAt: { gte: since },
        OR: [
          { status: "DEAD" },
          { status: "PENDING", attempts: { gt: 0 }, lastError: { not: null } },
        ],
      },
    }),
    sumMetric("webhook.bad_signature", 60, now),
  ]);
  const limit = config.alerts.bad_webhook_signatures_per_hour;
  return {
    firing: failing > 0 || (limit > 0 && badSignatures >= limit),
    detail: `Last hour: ${failing} webhook event(s) failing to process, ${badSignatures} with a wrong signature.`,
  };
}

export async function checkStockouts(now = new Date()): Promise<CheckResult> {
  const top = config.alerts.stockout_top_sellers;
  if (top === 0) return { firing: false, detail: "Off" };
  const since = new Date(now.getTime() - 30 * 24 * HOUR);
  const sellers = await db.orderItem.groupBy({
    by: ["productId"],
    where: { order: { status: { in: [...SOLD] }, createdAt: { gte: since } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: top,
  });
  if (sellers.length === 0) return { firing: false, detail: "No sales in the last 30 days." };
  const products = await db.product.findMany({
    where: { id: { in: sellers.map((s) => s.productId) }, isActive: true },
    select: { name: true, stock: true, reservedStock: true },
  });
  const out = products.filter((p) => availableStock(p) <= 0).map((p) => p.name);
  return {
    firing: out.length > 0,
    detail: out.length
      ? `Out of stock: ${out.slice(0, 10).join(", ")}${out.length > 10 ? "…" : ""}.`
      : `All ${products.length} best-sellers are in stock.`,
  };
}

export async function checkErrorSpike(now = new Date()): Promise<CheckResult> {
  const limit = config.alerts.error_spike_count;
  if (limit === 0) return { firing: false, detail: "Off" };
  const n = await sumMetric("log.error", 10, now);
  return {
    firing: n >= limit,
    detail: `${n} error(s) logged in the last 10 min (alert at ${limit}).`,
  };
}

const CHECKS: Record<AlertKey, (now: Date) => Promise<CheckResult>> = {
  payments: checkPayments,
  no_orders: checkNoOrders,
  dead_jobs: checkDeadJobs,
  webhooks: checkWebhooks,
  stockouts: checkStockouts,
  error_spike: checkErrorSpike,
};

// ───────────────────────── state & notifications ─────────────────────────

export type AlertChange = "started" | "reminder" | "resolved";

/**
 * Runs the checks (all, or just `keys`) and records the outcome. Returns what changed, and
 * queues one notification per change. Safe to call from several places at once.
 */
export async function evaluateAlerts(keys: AlertKey[] = ALERT_KEYS, now = new Date()) {
  const changes: { key: AlertKey; change: AlertChange; detail: string }[] = [];
  const repeatBefore = new Date(now.getTime() - config.alerts.repeat_hours * HOUR);
  for (const key of keys) {
    let result: CheckResult;
    try {
      result = await CHECKS[key](now);
    } catch (error) {
      logger.warn("monitor.check_failed", { key, error });
      continue;
    }
    await db.alertState.upsert({
      where: { key },
      create: { key, detail: result.detail, checkedAt: now },
      update: {},
    });
    let change: AlertChange | null = null;
    if (result.firing) {
      const started = await db.alertState.updateMany({
        where: { key, firing: false },
        data: {
          firing: true,
          since: now,
          lastNotifiedAt: now,
          detail: result.detail,
          checkedAt: now,
        },
      });
      if (started.count) change = "started";
      else {
        const reminded = await db.alertState.updateMany({
          where: { key, firing: true, lastNotifiedAt: { lt: repeatBefore } },
          data: { lastNotifiedAt: now, detail: result.detail, checkedAt: now },
        });
        if (reminded.count) change = "reminder";
      }
    } else {
      const resolved = await db.alertState.updateMany({
        where: { key, firing: true },
        data: { firing: false, since: null, detail: result.detail, checkedAt: now },
      });
      if (resolved.count) change = "resolved";
    }
    if (!change) {
      await db.alertState.update({
        where: { key },
        data: { detail: result.detail, checkedAt: now },
      });
      continue;
    }
    changes.push({ key, change, detail: result.detail });
    logger[change === "resolved" ? "info" : "warn"](`alert.${change}`, {
      alert: key,
      detail: result.detail,
    });
    const { enqueue, kickJobs } = await import("@/services/jobs.service");
    await enqueue("alerts.notify", { key, change, detail: result.detail, at: now.toISOString() });
    await kickJobs();
  }
  return changes;
}

/**
 * Event-driven check (e.g. right after a payment fails), so an outage alerts within seconds
 * instead of waiting for the next cron run. Runs after the response when inside a request.
 */
export async function checkSoon(keys: AlertKey[]) {
  const run = () =>
    evaluateAlerts(keys).catch((error) => logger.warn("monitor.check_soon_failed", { error }));
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    await run(); // not inside a request (jobs, scripts, tests)
  }
}

export async function listAlertStates() {
  const rows = await db.alertState.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return ALERT_KEYS.map((key) => ({ key, ...ALERTS[key], state: byKey.get(key) ?? null }));
}

/**
 * Who gets alert emails: [alerts] admin_email; otherwise the staff who can open Admin → System
 * (Owners and Managers) — not every staff account (support staff can't act on them).
 */
export async function alertRecipients(): Promise<string[]> {
  if (config.alerts.admin_email) return [config.alerts.admin_email];
  const staff = await db.user.findMany({
    where: {
      role: "ADMIN", // deactivated staff lose the admin role
      staffRoles: { some: { role: { permissions: { some: { permissionKey: "system.view" } } } } },
    },
    select: { email: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return [...new Set(staff.map((s) => s.email).filter(Boolean))];
}

/** Sends one alert notification (run by the alerts.notify job, so it's retried if it fails). */
export async function deliverAlert(p: {
  key: AlertKey;
  change: AlertChange;
  detail: string;
  at: string;
}) {
  const { publicEnv, env } = await import("@/lib/env");
  const { sendEmail } = await import("@/services/email.service");
  const alert = ALERTS[p.key];
  const tag =
    p.change === "resolved" ? "Resolved" : p.change === "reminder" ? "Still happening" : "Alert";
  const subject = `[${tag}] ${alert.title}`;
  const page = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/system`;
  const what =
    p.change === "resolved"
      ? "This has cleared — no action needed."
      : `What to do: Docs/RUNBOOK.md → "${alert.title}" (#${alert.runbook}).`;
  const text = `${alert.title}\n\n${p.detail}\n\n${what}\n\nSystem page: ${page}\nTime: ${p.at}`;
  const esc = (s: string) => s.replace(/[<>&"]/g, "");
  const html = `<h2>${esc(alert.title)}</h2><p>${esc(p.detail)}</p><p>${esc(what)}</p><p><a href="${page}">Open the system page</a> · ${esc(p.at)}</p>`;
  for (const to of await alertRecipients()) await sendEmail({ to, subject, text, html });
  if (env.ALERT_WEBHOOK_URL) {
    const res = await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // "text" works for Slack and Google Chat; "content" for Discord.
      body: JSON.stringify({
        text: `${subject}\n${p.detail}\n${page}`,
        content: `${subject}\n${p.detail}\n${page}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Alert webhook responded ${res.status}`);
  }
  logger.info("alert.delivered", { alert: p.key, change: p.change });
}
