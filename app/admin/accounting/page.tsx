import Link from "next/link";
import { ProductImportForm } from "@/components/admin/accounting-forms";
import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/lib/auth-guards";
import { isRazorpayConfigured } from "@/lib/env";
import { formatINR } from "@/lib/format";
import { formatIst } from "@/lib/merch";
import { PRODUCT_CSV_COLUMNS } from "@/services/product-csv.service";
import { gstSummary } from "@/services/gst-report.service";
import { listRuns, type ReconIssue, type ReconSummary } from "@/services/recon.service";
import { reconcileUploadAction, recordRemittanceAction } from "../actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  razorpay_settlement: "Razorpay settlement",
  cod_remittance: "COD remittance",
};
const ISSUE_LABEL: Record<string, string> = {
  amount_mismatch: "Amount differs",
  unknown_payment: "Unknown payment",
  unknown_refund: "Unknown refund",
  not_settled: "Not settled",
  not_settled_recent: "Settles soon",
  unknown_parcel: "Unknown parcel",
  not_cod: "Not a COD order",
  already_recorded: "Already recorded",
  ready_to_record: "Ready to record",
  cod_overdue: "Cash overdue",
};
const OK_KINDS = ["already_recorded", "ready_to_record", "not_settled_recent"];

function currentMonth() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
}

/** Admin → Accounting (Phase 29): product CSV, GST reports, reconciliation. */
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; run?: string; reconError?: string; recorded?: string }>;
}) {
  await requirePermissionPage("accounting.manage", "/admin/accounting");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const [summary, runs] = await Promise.all([gstSummary(month), listRuns(15)]);
  const selected = runs.find((r) => r.id === sp.run) ?? null;

  return (
    <div className="space-y-12">
      <h1 className="text-2xl font-semibold tracking-tight">Accounting</h1>

      <section aria-labelledby="gst-h" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="gst-h" className="text-lg font-medium">
            GST reports
          </h2>
          <form className="flex items-end gap-2">
            <label className="text-sm">
              Month{" "}
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="border-input bg-background h-9 rounded-md border px-2"
              />
            </label>
            <Button type="submit" size="sm" variant="outline">
              Show
            </Button>
          </form>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-4" data-testid="gst-summary">
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground">Invoices</dt>
            <dd className="text-lg">{summary.invoices}</dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground">Taxable value</dt>
            <dd className="text-lg">{formatINR(summary.taxableInPaise)}</dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground">GST (CGST + SGST + IGST)</dt>
            <dd className="text-lg">
              {formatINR(summary.cgstInPaise + summary.sgstInPaise + summary.igstInPaise)}
            </dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground">Invoice value</dt>
            <dd className="text-lg">{formatINR(summary.totalInPaise)}</dd>
          </div>
        </dl>
        <p className="text-sm">
          {summary.matchesInvoices ? (
            <span className="text-emerald-800">✓ Report totals match the invoices.</span>
          ) : (
            <span className="text-red-700">
              ⚠ Some invoice lines don&apos;t add up — show your CA.
            </span>
          )}{" "}
          Refunds this month: {summary.refunds} ({formatINR(summary.refundedInPaise)}).
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["register", "Sales register"],
              ["b2cs", "B2CS summary (GSTR-1 table 7)"],
              ["hsn", "HSN summary (table 12)"],
              ["credit-notes", "Refunds / credit notes"],
            ] as const
          ).map(([kind, label]) => (
            <Button key={kind} asChild variant="outline" size="sm">
              <a href={`/api/admin/accounting?what=gst&kind=${kind}&month=${month}`} download>
                {label} (CSV)
              </a>
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          For Zoho Books / Tally: import the sales register. A live sync can be added once those
          accounts exist (see Docs/BACKLOG.md).
        </p>
      </section>

      <section id="reconcile" aria-labelledby="recon-h" className="space-y-4">
        <h2 id="recon-h" className="text-lg font-medium">
          Reconciliation
        </h2>
        <p className="text-muted-foreground text-sm">
          Upload Razorpay&apos;s settlement report (Dashboard → Reports → Settlement recon, CSV) or
          your courier&apos;s COD remittance sheet (AWB and amount columns).{" "}
          {isRazorpayConfigured
            ? "Razorpay settlements are also checked automatically every day."
            : "Once Razorpay keys are added, settlements are also checked automatically every day."}
        </p>
        {sp.reconError && (
          <p role="alert" className="text-sm text-red-700">
            {sp.reconError}
          </p>
        )}
        {sp.recorded && (
          <p role="status" className="text-sm text-emerald-800">
            Cash recorded for {sp.recorded} order(s).
          </p>
        )}
        <form
          action={reconcileUploadAction}
          className="flex flex-wrap items-center gap-3"
          aria-label="Reconcile"
        >
          <select
            name="reconKind"
            aria-label="File type"
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="razorpay_settlement">Razorpay settlement report</option>
            <option value="cod_remittance">Courier COD remittance</option>
          </select>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            aria-label="Report file"
            required
            className="text-sm"
          />
          <Button type="submit" size="sm">
            Check
          </Button>
        </form>

        {selected && (
          <div className="space-y-3 rounded-md border p-4" data-testid="recon-run">
            {(() => {
              const s = selected.summary as unknown as ReconSummary;
              const issues = selected.issues as unknown as ReconIssue[];
              const problems = issues.filter((i) => !OK_KINDS.includes(i.kind));
              return (
                <>
                  <p className="text-sm">
                    <strong>{KIND_LABEL[selected.kind]}</strong> · {selected.source} ·{" "}
                    {formatIst(selected.createdAt)}
                  </p>
                  <p className="text-sm">
                    {s.matched} matched · {s.mismatched} differ · {s.unknown} unknown · {s.missing}{" "}
                    missing
                    {s.explained ? ` · ${s.explained} explained` : ""}
                    {s.feesInPaise ? ` · Razorpay fees ${formatINR(s.feesInPaise)}` : ""}
                  </p>
                  <p className={`text-sm ${problems.length ? "text-red-700" : "text-emerald-800"}`}>
                    {problems.length
                      ? `${problems.length} difference(s) to look at:`
                      : "✓ No unexplained differences."}
                  </p>
                  {problems.length > 0 && (
                    <ul className="max-h-72 space-y-1 overflow-auto text-sm">
                      {problems.slice(0, 200).map((i, n) => (
                        <li key={n}>
                          <strong>{ISSUE_LABEL[i.kind] ?? i.kind}</strong> · {i.ref}
                          {i.expectedInPaise !== undefined &&
                            ` · expected ${formatINR(i.expectedInPaise)}`}
                          {i.reportedInPaise !== undefined &&
                            ` · reported ${formatINR(i.reportedInPaise)}`}{" "}
                          — {i.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/admin/accounting?what=recon&id=${selected.id}`} download>
                        Download all lines (CSV)
                      </a>
                    </Button>
                    {selected.kind === "cod_remittance" && (s.readyToRecord ?? 0) > 0 && (
                      <form action={recordRemittanceAction}>
                        <input type="hidden" name="runId" value={selected.id} />
                        <Button type="submit" size="sm">
                          Record cash for {s.readyToRecord} matching order(s)
                        </Button>
                      </form>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {runs.length > 0 && (
          <ul className="divide-border divide-y rounded-md border text-sm">
            {runs.map((r) => {
              const s = r.summary as unknown as ReconSummary;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <Link href={`/admin/accounting?run=${r.id}#reconcile`} className="underline">
                    {KIND_LABEL[r.kind]} · {formatIst(r.createdAt)}
                  </Link>
                  <span className="text-muted-foreground">
                    {s.matched} matched · {s.mismatched + s.unknown + s.missing} to check
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="csv-h" className="space-y-4">
        <h2 id="csv-h" className="text-lg font-medium">
          Products: bulk import / export
        </h2>
        <p className="text-muted-foreground text-sm">
          Export, edit in Excel or Google Sheets, import. Same rules as the product form; a row
          without a matching <code>slug</code> creates a new product. Nothing is saved unless every
          row is valid. Columns: {PRODUCT_CSV_COLUMNS.join(", ")}.
        </p>
        <Button asChild variant="outline" size="sm">
          <a href="/api/admin/accounting?what=products" download>
            Export all products (CSV)
          </a>
        </Button>
        <ProductImportForm />
      </section>
    </div>
  );
}
