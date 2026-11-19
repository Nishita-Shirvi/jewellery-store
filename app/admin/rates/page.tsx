import { requirePermissionPage } from "@/lib/auth-guards";
import { RatesForm } from "@/components/admin/rates-form";
import { config } from "@/lib/config";
import { formatINR } from "@/lib/format";
import { purityLabel } from "@/lib/jewellery";
import { PURITIES } from "@/lib/metal-pricing";
import { paiseToRupeesInput } from "@/lib/money";
import {
  getCurrentRates,
  listRateHistory,
  productsNeedingReprice,
  rateLinkedCounts,
} from "@/services/metal-rate.service";
import { Button } from "@/components/ui/button";
import { repriceNowAction } from "../storefront-actions";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function AdminRatesPage() {
  await requirePermissionPage("products.view", "/admin/rates");
  const [rates, counts, history, outOfDate] = await Promise.all([
    getCurrentRates(),
    rateLinkedCounts(),
    listRateHistory(30),
    productsNeedingReprice(),
  ]);
  const rows = PURITIES.map((p) => ({
    purity: p,
    label: purityLabel[p] === "925" ? "925 silver" : purityLabel[p],
    current: rates[p] ? paiseToRupeesInput(rates[p]!.ratePerGramInPaise) : "",
    updated: rates[p] ? when.format(new Date(rates[p]!.updatedAt)) : null,
    linkedProducts: counts[p] ?? 0,
  }));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gold and metal rates</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Enter today&apos;s selling rate per gram. Products set to “Follows today&apos;s metal
          rate” are repriced automatically; fixed-price products don&apos;t change. Rates are shown
          to shoppers in the bar above the header.
        </p>
      </div>

      {outOfDate > 0 && (
        <form
          action={repriceNowAction}
          className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p>
            {outOfDate} rate-linked product{outOfDate === 1 ? "" : "s"} still show
            {outOfDate === 1 ? "s" : ""} an old price (a repricing didn&apos;t finish).
          </p>
          <Button type="submit" size="sm" variant="outline">
            Reprice now
          </Button>
        </form>
      )}

      <RatesForm rows={rows} largePercent={config.pricing.large_change_percent} />

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-semibold">
          Recent changes
        </h2>
        {history.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">No rates saved yet.</p>
        ) : (
          <div className="border-border mt-3 overflow-x-auto rounded-md border">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted text-muted-foreground text-left text-xs">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Purity</th>
                  <th className="p-3">Rate per gram</th>
                  <th className="p-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="p-3">{when.format(h.createdAt)}</td>
                    <td className="p-3">{purityLabel[h.purity]}</td>
                    <td className="p-3">{formatINR(h.ratePerGramInPaise)}</td>
                    <td className="text-muted-foreground p-3">{h.setBy?.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
