import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env, isRazorpayConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { csvRecords } from "@/lib/report/csv";
import { AdminInputError } from "@/services/admin/product-admin.service";

/**
 * Reconciliation (Phase 29): do the money reports from Razorpay and the courier agree with our
 * orders? Works from an uploaded file (Razorpay dashboard → Reports → Settlement recon; the
 * courier's COD remittance sheet) — no API keys needed — and, once Razorpay keys are set, also
 * fetches yesterday's settlement report every day by itself.
 *
 * Every difference is listed with a plain reason; "zero unexplained differences" means every
 * line either matches exactly or is explained (e.g. "not settled yet — paid 1 day ago").
 */

export type IssueKind =
  | "amount_mismatch"
  | "unknown_payment"
  | "unknown_refund"
  | "not_settled"
  | "not_settled_recent"
  | "unknown_parcel"
  | "not_cod"
  | "already_recorded"
  | "ready_to_record"
  | "cod_overdue";

export interface ReconIssue {
  kind: IssueKind;
  ref: string;
  orderId?: string;
  detail: string;
  expectedInPaise?: number;
  reportedInPaise?: number;
}

export interface ReconSummary {
  matched: number;
  mismatched: number;
  unknown: number;
  missing: number;
  /** Explained, not a problem (e.g. paid yesterday, settles tomorrow). */
  explained: number;
  feesInPaise?: number;
  readyToRecord?: number;
}

const DAY = 86_400_000;
/** Razorpay settles in T+2 working days: younger unsettled payments aren't a problem yet. */
const SETTLEMENT_GRACE_DAYS = 3;
/** COD cash should be remitted within ~10 days of delivery. */
const COD_OVERDUE_DAYS = 10;

/** "1,500.00" / "₹1500" / "1500" → paise; null when not a number. */
export function rupeesToPaise(value: string | undefined): number | null {
  const v = (value ?? "").replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

function pick(values: Record<string, string>, ...names: string[]) {
  for (const n of names) if (values[n] !== undefined && values[n] !== "") return values[n];
  return undefined;
}

export interface SettlementLine {
  entityId: string;
  type: string;
  amountInPaise: number;
  feeInPaise: number;
  createdAt: Date | null;
}

/** Razorpay settlement recon CSV (dashboard export) → lines. */
export function parseSettlementCsv(text: string): SettlementLine[] {
  const records = csvRecords(text);
  if (records.length === 0) throw new AdminInputError("The file has no rows.");
  const header = Object.keys(records[0]!.values);
  if (!header.includes("entity_id") || !header.includes("amount"))
    throw new AdminInputError(
      "This doesn't look like a Razorpay settlement report (needs entity_id and amount columns).",
    );
  const lines: SettlementLine[] = [];
  for (const { line, values } of records) {
    const amount = rupeesToPaise(values.amount);
    if (amount === null)
      throw new AdminInputError(`Line ${line}: amount "${values.amount}" isn't a number.`);
    const created = pick(values, "created_at", "created at");
    lines.push({
      entityId: values.entity_id!,
      type: (values.type ?? "payment").toLowerCase(),
      amountInPaise: Math.abs(amount),
      feeInPaise:
        Math.abs(rupeesToPaise(values.fee) ?? 0) + Math.abs(rupeesToPaise(values.tax) ?? 0),
      createdAt: created ? parseDate(created) : null,
    });
  }
  return lines;
}

function parseDate(v: string): Date | null {
  const n = Number(v);
  const d =
    Number.isFinite(n) && /^\d{9,13}$/.test(v) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Checks settlement lines against our payments and refunds; saves and returns the run. */
export async function reconcileSettlement(
  lines: SettlementLine[],
  source: string,
  createdById: string | null,
  now = new Date(),
) {
  const issues: ReconIssue[] = [];
  const summary: ReconSummary = {
    matched: 0,
    mismatched: 0,
    unknown: 0,
    missing: 0,
    explained: 0,
    feesInPaise: 0,
  };
  const paymentIds = lines.filter((l) => l.type === "payment").map((l) => l.entityId);
  const refundIds = lines.filter((l) => l.type === "refund").map((l) => l.entityId);
  const [payments, refunds] = await Promise.all([
    db.payment.findMany({
      where: { providerPaymentId: { in: paymentIds } },
      select: { providerPaymentId: true, amountInPaise: true, orderId: true },
    }),
    db.refund.findMany({
      where: { razorpayRefundId: { in: refundIds } },
      select: { razorpayRefundId: true, amountInPaise: true, orderId: true },
    }),
  ]);
  const payById = new Map(payments.map((p) => [p.providerPaymentId!, p]));
  const refundById = new Map(refunds.map((r) => [r.razorpayRefundId!, r]));

  for (const l of lines) {
    summary.feesInPaise! += l.feeInPaise;
    if (l.type === "payment") {
      const p = payById.get(l.entityId);
      if (!p) {
        summary.unknown++;
        issues.push({
          kind: "unknown_payment",
          ref: l.entityId,
          reportedInPaise: l.amountInPaise,
          detail: "Razorpay settled a payment we have no order for.",
        });
      } else if (p.amountInPaise !== l.amountInPaise) {
        summary.mismatched++;
        issues.push({
          kind: "amount_mismatch",
          ref: l.entityId,
          orderId: p.orderId,
          expectedInPaise: p.amountInPaise,
          reportedInPaise: l.amountInPaise,
          detail: "Settled amount differs from the order's payment.",
        });
      } else summary.matched++;
    } else if (l.type === "refund") {
      const r = refundById.get(l.entityId);
      if (!r) {
        summary.unknown++;
        issues.push({
          kind: "unknown_refund",
          ref: l.entityId,
          reportedInPaise: l.amountInPaise,
          detail: "Razorpay shows a refund we have no record of.",
        });
      } else if (r.amountInPaise !== l.amountInPaise) {
        summary.mismatched++;
        issues.push({
          kind: "amount_mismatch",
          ref: l.entityId,
          orderId: r.orderId,
          expectedInPaise: r.amountInPaise,
          reportedInPaise: l.amountInPaise,
          detail: "Refunded amount differs from our refund.",
        });
      } else summary.matched++;
    } else summary.matched++; // adjustments, transfers: shown in Razorpay, nothing to match here
  }

  // Our captured payments in the report's period that it doesn't contain.
  const dates = lines.map((l) => l.createdAt).filter((d): d is Date => d !== null);
  if (dates.length) {
    const from = new Date(Math.min(...dates.map((d) => d.getTime())));
    const to = new Date(Math.max(...dates.map((d) => d.getTime())));
    const ours = await db.payment.findMany({
      where: {
        status: "CAPTURED",
        provider: "RAZORPAY",
        createdAt: { gte: from, lte: to },
        providerPaymentId: { notIn: paymentIds },
      },
      select: { providerPaymentId: true, orderId: true, amountInPaise: true, createdAt: true },
    });
    for (const p of ours) {
      const ageDays = Math.floor((now.getTime() - p.createdAt.getTime()) / DAY);
      const recent = ageDays < SETTLEMENT_GRACE_DAYS;
      if (recent) summary.explained++;
      else summary.missing++;
      issues.push({
        kind: recent ? "not_settled_recent" : "not_settled",
        ref: p.providerPaymentId ?? p.orderId,
        orderId: p.orderId,
        expectedInPaise: p.amountInPaise,
        detail: recent
          ? `Paid ${ageDays} day(s) ago — Razorpay settles in about 2 working days.`
          : `Paid ${ageDays} days ago but not in this settlement report.`,
      });
    }
  }
  return saveRun("razorpay_settlement", source, summary, issues, createdById);
}

export interface RemittanceLine {
  ref: string;
  amountInPaise: number;
  line: number;
}

/** Courier COD remittance sheet → lines (AWB / tracking number, or our order number). */
export function parseRemittanceCsv(text: string): RemittanceLine[] {
  const records = csvRecords(text);
  if (records.length === 0) throw new AdminInputError("The file has no rows.");
  return records.map(({ line, values }) => {
    const ref = pick(
      values,
      "awb",
      "awb number",
      "awb no",
      "tracking number",
      "order",
      "order number",
      "order id",
    );
    const amount = rupeesToPaise(
      pick(values, "cod amount", "amount", "cod_amount", "remitted amount"),
    );
    if (!ref) throw new AdminInputError(`Line ${line}: no AWB / order number.`);
    if (amount === null) throw new AdminInputError(`Line ${line}: the amount isn't a number.`);
    return { ref: ref.trim(), amountInPaise: amount, line };
  });
}

/** Checks a courier's COD remittance against delivered COD orders; saves and returns the run. */
export async function reconcileRemittance(
  lines: RemittanceLine[],
  source: string,
  createdById: string | null,
  now = new Date(),
) {
  const issues: ReconIssue[] = [];
  const summary: ReconSummary = {
    matched: 0,
    mismatched: 0,
    unknown: 0,
    missing: 0,
    explained: 0,
    readyToRecord: 0,
  };
  const refs = lines.map((l) => l.ref);
  const byOrderNumber = refs
    .filter((r) => /^#?[a-z0-9]{8}$/i.test(r))
    .map((r) => r.replace("#", "").toLowerCase());
  const [shipments, ordersByNumber] = await Promise.all([
    db.shipment.findMany({
      where: { awb: { in: refs } },
      select: {
        awb: true,
        order: { select: { id: true, paymentMethod: true, totalInPaise: true, paidAt: true } },
      },
    }),
    byOrderNumber.length
      ? db.order.findMany({
          where: { OR: byOrderNumber.map((n) => ({ id: { endsWith: n } })) },
          select: { id: true, paymentMethod: true, totalInPaise: true, paidAt: true },
        })
      : Promise.resolve([]),
  ]);
  const byAwb = new Map(shipments.map((s) => [s.awb!, s.order]));
  const findOrder = (ref: string) =>
    byAwb.get(ref) ??
    ordersByNumber.find((o) => o.id.toLowerCase().endsWith(ref.replace("#", "").toLowerCase()));

  const seen = new Set<string>();
  for (const l of lines) {
    const o = findOrder(l.ref);
    if (!o) {
      summary.unknown++;
      issues.push({
        kind: "unknown_parcel",
        ref: l.ref,
        reportedInPaise: l.amountInPaise,
        detail: `Line ${l.line}: no order with this AWB / order number.`,
      });
      continue;
    }
    seen.add(o.id);
    if (o.paymentMethod !== "COD") {
      summary.mismatched++;
      issues.push({
        kind: "not_cod",
        ref: l.ref,
        orderId: o.id,
        reportedInPaise: l.amountInPaise,
        detail: "This order was prepaid — the courier shouldn't have collected cash.",
      });
    } else if (o.totalInPaise !== l.amountInPaise) {
      summary.mismatched++;
      issues.push({
        kind: "amount_mismatch",
        ref: l.ref,
        orderId: o.id,
        expectedInPaise: o.totalInPaise,
        reportedInPaise: l.amountInPaise,
        detail: "Remitted amount differs from the order total.",
      });
    } else if (o.paidAt) {
      summary.matched++;
      issues.push({
        kind: "already_recorded",
        ref: l.ref,
        orderId: o.id,
        expectedInPaise: o.totalInPaise,
        detail: "Matches; cash already recorded.",
      });
    } else {
      summary.matched++;
      summary.readyToRecord!++;
      issues.push({
        kind: "ready_to_record",
        ref: l.ref,
        orderId: o.id,
        expectedInPaise: o.totalInPaise,
        detail: "Matches — record the cash as received.",
      });
    }
  }
  // Delivered COD orders whose cash is overdue and isn't in this sheet.
  const overdue = await db.order.findMany({
    where: {
      paymentMethod: "COD",
      paidAt: null,
      status: "DELIVERED",
      deliveredAt: { lt: new Date(now.getTime() - COD_OVERDUE_DAYS * DAY) },
      id: { notIn: [...seen] },
    },
    select: { id: true, totalInPaise: true, deliveredAt: true },
    take: 200,
  });
  for (const o of overdue) {
    summary.missing++;
    issues.push({
      kind: "cod_overdue",
      ref: `#${o.id.slice(-8).toUpperCase()}`,
      orderId: o.id,
      expectedInPaise: o.totalInPaise,
      detail: `Delivered ${Math.floor((now.getTime() - o.deliveredAt!.getTime()) / DAY)} days ago; cash not remitted yet.`,
    });
  }
  return saveRun("cod_remittance", source, summary, issues, createdById);
}

async function saveRun(
  kind: string,
  source: string,
  summary: ReconSummary,
  issues: ReconIssue[],
  createdById: string | null,
) {
  const run = await db.reconRun.create({
    data: {
      kind,
      source: source.slice(0, 200),
      summary: summary as unknown as Prisma.InputJsonValue,
      issues: issues.slice(0, 5000) as unknown as Prisma.InputJsonValue,
      createdById,
    },
  });
  logger.info("recon.run", { kind, ...summary });
  return run;
}

export async function listRuns(limit = 20) {
  return db.reconRun.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

// ───────────────────────── daily Razorpay fetch (only with keys) ─────────────────────────

/** Yesterday's settlement recon from Razorpay's API (amounts in paise there). */
export async function fetchRazorpayRecon(day: Date): Promise<SettlementLine[]> {
  const d = new Date(day.getTime() + 330 * 60_000);
  const url = `${env.RAZORPAY_API_BASE}/v1/settlements/recon/combined?year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}&day=${d.getUTCDate()}&count=1000`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Razorpay recon responded ${res.status}`);
  const body = (await res.json()) as {
    items?: {
      entity_id: string;
      type: string;
      amount: number;
      fee?: number;
      tax?: number;
      created_at?: number;
    }[];
  };
  return (body.items ?? []).map((i) => ({
    entityId: i.entity_id,
    type: i.type,
    amountInPaise: Math.abs(i.amount),
    feeInPaise: Math.abs(i.fee ?? 0) + Math.abs(i.tax ?? 0),
    createdAt: i.created_at ? new Date(i.created_at * 1000) : null,
  }));
}

const RECON_KEY = "recon.razorpayAt";

/** True when the daily settlement check should run (keys set, not done in the last 20 h). */
export async function razorpayReconIsDue(now = new Date()) {
  // Not under the unit/DB test runner: its Razorpay keys are fake and nothing answers.
  if (!isRazorpayConfigured || process.env.VITEST) return false;
  const row = await db.appSetting.findUnique({ where: { key: RECON_KEY } });
  const last = typeof row?.value === "string" ? Date.parse(row.value) : NaN;
  return !(Number.isFinite(last) && now.getTime() - last < 20 * 3_600_000);
}

/** Cron: once a day, when Razorpay keys exist, check yesterday's settlement. */
export async function dailyRazorpayRecon(now = new Date()) {
  if (!isRazorpayConfigured) return { skipped: "no_keys" as const };
  const row = await db.appSetting.findUnique({ where: { key: RECON_KEY } });
  const last = typeof row?.value === "string" ? Date.parse(row.value) : NaN;
  if (Number.isFinite(last) && now.getTime() - last < 20 * 3_600_000)
    return { skipped: "done_today" as const };
  // Remember the attempt first: if Razorpay is down, try again tomorrow, not every tick.
  await db.appSetting.upsert({
    where: { key: RECON_KEY },
    create: { key: RECON_KEY, value: now.toISOString() },
    update: { value: now.toISOString() },
  });
  const yesterday = new Date(now.getTime() - DAY);
  const lines = await fetchRazorpayRecon(yesterday);
  const run = await reconcileSettlement(
    lines,
    `razorpay api ${yesterday.toISOString().slice(0, 10)}`,
    null,
    now,
  );
  return { runId: run.id };
}

export async function getReconRun(id: string) {
  return db.reconRun.findUnique({ where: { id } });
}
