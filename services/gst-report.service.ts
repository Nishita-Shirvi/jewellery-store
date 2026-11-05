import "server-only";
import { db } from "@/lib/db";
import { placeOfSupply } from "@/lib/india";
import { csvRow } from "@/lib/report/csv";
import type { InvoiceSnapshot } from "@/services/invoice.service";

/**
 * GST reports for a month (Phase 29), in the shape GSTR-1 asks for (B2C sales; this store
 * sells to consumers):
 *  - sales register: one line per invoice
 *  - B2CS summary: taxable value and tax per place of supply and rate (GSTR-1 table 7)
 *  - HSN summary (table 12)
 *  - credit notes: refunds in the month, with tax split in the same proportion as the invoice
 * Built from the invoices themselves, so the totals always match what customers received; the
 * report checks that and says so. Amounts in rupees with 2 decimals (paise internally).
 * A CA should review the first filing (blocker B-09).
 */

export type GstReportKind = "register" | "b2cs" | "hsn" | "credit-notes";

const IST = 330 * 60_000;

/** "2026-11" → the month's start and end as instants (India time). */
export function monthRange(month: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error("Month must look like 2026-11");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  return {
    from: new Date(Date.UTC(y, mo - 1, 1) - IST),
    to: new Date(Date.UTC(mo === 12 ? y + 1 : y, mo === 12 ? 0 : mo, 1) - IST),
  };
}

const r = (paise: number) => (paise / 100).toFixed(2);
const rate = (bps: number) => (bps / 100).toString();

async function invoicesIn(month: string) {
  const { from, to } = monthRange(month);
  const rows = await db.invoice.findMany({
    where: { createdAt: { gte: from, lt: to } },
    orderBy: [{ financialYear: "asc" }, { sequence: "asc" }],
    select: { number: true, orderId: true, createdAt: true, snapshot: true },
  });
  return rows.map((i) => ({ ...i, s: i.snapshot as unknown as InvoiceSnapshot }));
}

export interface GstSummary {
  month: string;
  invoices: number;
  taxableInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalInPaise: number;
  /** Line-level sums equal each invoice's own totals (should always be true). */
  matchesInvoices: boolean;
  refunds: number;
  refundedInPaise: number;
}

export async function gstSummary(month: string): Promise<GstSummary> {
  const invoices = await invoicesIn(month);
  const sum = {
    taxableInPaise: 0,
    cgstInPaise: 0,
    sgstInPaise: 0,
    igstInPaise: 0,
    totalInPaise: 0,
  };
  let matches = true;
  for (const { s } of invoices) {
    sum.taxableInPaise += s.totals.taxableInPaise;
    sum.cgstInPaise += s.totals.cgstInPaise;
    sum.sgstInPaise += s.totals.sgstInPaise;
    sum.igstInPaise += s.totals.igstInPaise;
    sum.totalInPaise += s.totals.totalInPaise;
    const lineTotal = s.lines.reduce((a, l) => a + l.totalInPaise, 0);
    const lineTax = s.lines.reduce((a, l) => a + l.cgstInPaise + l.sgstInPaise + l.igstInPaise, 0);
    const invTax = s.totals.cgstInPaise + s.totals.sgstInPaise + s.totals.igstInPaise;
    if (lineTotal !== s.totals.totalInPaise || lineTax !== invTax) matches = false;
  }
  const credit = await creditNotes(month);
  return {
    month,
    invoices: invoices.length,
    ...sum,
    matchesInvoices: matches,
    refunds: credit.length,
    refundedInPaise: credit.reduce((a, c) => a + c.amountInPaise, 0),
  };
}

async function creditNotes(month: string) {
  const { from, to } = monthRange(month);
  const refunds = await db.refund.findMany({
    where: { status: "PROCESSED", processedAt: { gte: from, lt: to } },
    orderBy: { processedAt: "asc" },
    select: {
      id: true,
      amountInPaise: true,
      processedAt: true,
      order: { select: { id: true, invoice: { select: { number: true, snapshot: true } } } },
    },
  });
  return refunds.map((f) => {
    const s = f.order.invoice?.snapshot as unknown as InvoiceSnapshot | undefined;
    const total = s?.totals.totalInPaise ?? 0;
    // Tax in the refund, in the same proportion as on the invoice (refunds are tax-inclusive).
    const share = (v: number) => (total > 0 ? Math.round((v * f.amountInPaise) / total) : 0);
    const cgst = share(s?.totals.cgstInPaise ?? 0);
    const sgst = share(s?.totals.sgstInPaise ?? 0);
    const igst = share(s?.totals.igstInPaise ?? 0);
    return {
      date: f.processedAt!,
      refundId: f.id,
      invoice: f.order.invoice?.number ?? "",
      pos: s ? placeOfSupply(s.placeOfSupply) : "",
      amountInPaise: f.amountInPaise,
      taxableInPaise: f.amountInPaise - cgst - sgst - igst,
      cgst,
      sgst,
      igst,
    };
  });
}

const istDate = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 10);

/** The CSV for one report. */
export async function gstReportCsv(kind: GstReportKind, month: string): Promise<string> {
  if (kind === "credit-notes") {
    let out = csvRow([
      "Refund date",
      "Refund ID",
      "Invoice number",
      "Place of supply",
      "Refund value",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
    ]);
    for (const c of await creditNotes(month))
      out += csvRow([
        istDate(c.date),
        c.refundId,
        c.invoice,
        c.pos,
        r(c.amountInPaise),
        r(c.taxableInPaise),
        r(c.cgst),
        r(c.sgst),
        r(c.igst),
      ]);
    return out;
  }
  const invoices = await invoicesIn(month);
  if (kind === "register") {
    let out = csvRow([
      "Invoice number",
      "Invoice date",
      "Order",
      "Place of supply",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
      "Invoice value",
      "Payment",
    ]);
    for (const { number, createdAt, s } of invoices)
      out += csvRow([
        number,
        istDate(createdAt),
        s.orderNumber,
        placeOfSupply(s.placeOfSupply),
        r(s.totals.taxableInPaise),
        r(s.totals.cgstInPaise),
        r(s.totals.sgstInPaise),
        r(s.totals.igstInPaise),
        r(s.totals.totalInPaise),
        s.paymentMode ?? "",
      ]);
    return out;
  }
  if (kind === "b2cs") {
    const groups = new Map<
      string,
      {
        pos: string;
        rateBps: number;
        type: string;
        taxable: number;
        cgst: number;
        sgst: number;
        igst: number;
      }
    >();
    for (const { s } of invoices)
      for (const l of s.lines) {
        const pos = placeOfSupply(s.placeOfSupply);
        const key = `${pos}|${l.rateBps}`;
        const g = groups.get(key) ?? {
          pos,
          rateBps: l.rateBps,
          type: s.intraState ? "Intra-state" : "Inter-state",
          taxable: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        };
        g.taxable += l.taxableInPaise;
        g.cgst += l.cgstInPaise;
        g.sgst += l.sgstInPaise;
        g.igst += l.igstInPaise;
        groups.set(key, g);
      }
    let out = csvRow([
      "Type",
      "Place of supply",
      "Rate (%)",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
    ]);
    for (const g of [...groups.values()].sort(
      (a, b) => a.pos.localeCompare(b.pos) || a.rateBps - b.rateBps,
    ))
      out += csvRow([
        g.type,
        g.pos,
        rate(g.rateBps),
        r(g.taxable),
        r(g.cgst),
        r(g.sgst),
        r(g.igst),
      ]);
    return out;
  }
  // HSN summary
  const hsn = new Map<
    string,
    {
      hsn: string;
      rateBps: number;
      qty: number;
      total: number;
      taxable: number;
      cgst: number;
      sgst: number;
      igst: number;
    }
  >();
  for (const { s } of invoices)
    for (const l of s.lines) {
      const key = `${l.hsn}|${l.rateBps}`;
      const h = hsn.get(key) ?? {
        hsn: l.hsn,
        rateBps: l.rateBps,
        qty: 0,
        total: 0,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      };
      h.qty += l.quantity;
      h.total += l.totalInPaise;
      h.taxable += l.taxableInPaise;
      h.cgst += l.cgstInPaise;
      h.sgst += l.sgstInPaise;
      h.igst += l.igstInPaise;
      hsn.set(key, h);
    }
  let out = csvRow([
    "HSN",
    "UQC",
    "Rate (%)",
    "Total quantity",
    "Total value",
    "Taxable value",
    "IGST",
    "CGST",
    "SGST",
  ]);
  for (const h of [...hsn.values()].sort(
    (a, b) => a.hsn.localeCompare(b.hsn) || a.rateBps - b.rateBps,
  ))
    out += csvRow([
      h.hsn,
      "NOS-NUMBERS",
      rate(h.rateBps),
      h.qty,
      r(h.total),
      r(h.taxable),
      r(h.igst),
      r(h.cgst),
      r(h.sgst),
    ]);
  return out;
}
