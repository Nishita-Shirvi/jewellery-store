import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError, requirePermission } from "@/lib/auth-guards";
import { csvRow } from "@/lib/report/csv";
import { withRequestId } from "@/lib/request-context";
import { audit } from "@/services/audit.service";
import { gstReportCsv, monthRange, type GstReportKind } from "@/services/gst-report.service";
import { exportProductsCsv } from "@/services/product-csv.service";
import { getReconRun, type ReconIssue } from "@/services/recon.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GST_KINDS: GstReportKind[] = ["register", "b2cs", "hsn", "credit-notes"];

function csv(body: string, filename: string) {
  return new NextResponse("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * GET /api/admin/accounting?what=products                       → all products (import template)
 * GET /api/admin/accounting?what=gst&kind=register&month=2026-11 → a GST report
 * GET /api/admin/accounting?what=recon&id=<run>                  → one reconciliation's lines
 * Staff with accounting.manage only (Phase 29).
 */
async function handleGET(request: Request) {
  let admin;
  try {
    admin = await requirePermission("accounting.manage");
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const q = new URL(request.url).searchParams;
  const what = q.get("what");
  if (what === "products") {
    await audit(admin, {
      action: "product.csv_export",
      entityType: "product",
      entityId: "csv",
      summary: "Products exported to CSV",
    });
    return csv(await exportProductsCsv(), `products-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  if (what === "gst") {
    const kind = q.get("kind") as GstReportKind;
    const month = q.get("month") ?? "";
    if (!GST_KINDS.includes(kind))
      return NextResponse.json({ error: "unknown report" }, { status: 400 });
    try {
      monthRange(month);
    } catch {
      return NextResponse.json({ error: "month must look like 2026-11" }, { status: 400 });
    }
    return csv(await gstReportCsv(kind, month), `gst-${kind}-${month}.csv`);
  }
  if (what === "recon") {
    const id = q.get("id") ?? "";
    const run = /^[a-z0-9]{1,40}$/i.test(id) ? await getReconRun(id) : null;
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
    let out = csvRow(["Result", "Reference", "Order", "Expected (₹)", "Reported (₹)", "Detail"]);
    for (const i of run.issues as unknown as ReconIssue[])
      out += csvRow([
        i.kind,
        i.ref,
        i.orderId ? `#${i.orderId.slice(-8).toUpperCase()}` : "",
        i.expectedInPaise !== undefined ? (i.expectedInPaise / 100).toFixed(2) : "",
        i.reportedInPaise !== undefined ? (i.reportedInPaise / 100).toFixed(2) : "",
        i.detail,
      ]);
    return csv(out, `reconciliation-${run.kind}-${run.createdAt.toISOString().slice(0, 10)}.csv`);
  }
  return NextResponse.json({ error: "unknown download" }, { status: 400 });
}

export const GET = withRequestId(handleGET);
