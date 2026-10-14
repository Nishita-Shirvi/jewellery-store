import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { istDay, istMidnight } from "@/lib/report/dates";
import { lowStockProducts, salesReport } from "@/services/report.service";

export const dynamic = "force-dynamic";

const FUNNEL_LABEL = {
  view_item: "Product views",
  add_to_cart: "Added to cart",
  begin_checkout: "Started checkout",
  purchase: "Purchased",
} as const;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const daysParam = Number((await searchParams).days);
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;
  const [report, lowStock] = await Promise.all([salesReport(days), lowStockProducts()]);
  const maxDay = Math.max(1, ...report.daily.map((d) => d.revenueInPaise));
  const f = report.funnel;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Reports</h1>
        <nav aria-label="Period" className="flex gap-2 text-sm">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/admin/reports?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={`border-border rounded-md border px-3 py-1 ${d === days ? "bg-primary text-primary-foreground" : ""}`}
            >
              Last {d} days
            </Link>
          ))}
        </nav>
      </div>

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-5" aria-label="Totals">
        {[
          ["Orders", String(report.totals.orders)],
          ["Gross sales", formatINR(report.totals.grossInPaise)],
          ["Refunds", formatINR(report.totals.refundedInPaise)],
          ["Net sales", formatINR(report.totals.netInPaise)],
          ["Average order", formatINR(report.totals.averageOrderInPaise)],
        ].map(([label, value]) => (
          <li key={label} className="border-border rounded-md border p-4">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-1 text-xl font-semibold" data-testid={`report-${label}`}>
              {value}
            </p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="daily-h">
        <h2 id="daily-h" className="text-xl">
          Revenue by day
        </h2>
        <div
          className="border-border mt-4 flex h-40 items-end gap-[2px] rounded-md border p-3"
          role="img"
          aria-label={`Daily revenue for the last ${days} days`}
        >
          {report.daily.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${formatINR(d.revenueInPaise)} (${d.orders} orders)`}
              className="bg-primary/80 flex-1 rounded-t-sm"
              style={{
                height: `${Math.max(2, (d.revenueInPaise / maxDay) * 100)}%`,
                opacity: d.revenueInPaise ? 1 : 0.15,
              }}
            />
          ))}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {report.daily[0]?.day} to {report.daily.at(-1)?.day} (India time). Hover a bar for the
          figure.
        </p>
      </section>

      <div className="grid gap-10 md:grid-cols-2">
        <section aria-labelledby="weekly-h">
          <h2 id="weekly-h" className="text-xl">
            By week
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="py-1">Week of</th>
                <th>Orders</th>
                <th className="text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {report.weekly.map((w) => (
                <tr key={w.week}>
                  <td className="py-1.5">{w.week}</td>
                  <td>{w.orders}</td>
                  <td className="text-right">{formatINR(w.revenueInPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="funnel-h">
          <h2 id="funnel-h" className="text-xl">
            Shopping funnel
          </h2>
          <ol className="mt-3 space-y-2 text-sm">
            {(Object.keys(FUNNEL_LABEL) as (keyof typeof FUNNEL_LABEL)[]).map((k, i, all) => (
              <li key={k} className="flex justify-between">
                <span>{FUNNEL_LABEL[k]}</span>
                <span data-testid={`funnel-${k}`}>
                  {f[k]}
                  {i > 0 && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      ({pct(f[k], f[all[i - 1]!])} of previous)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground mt-2 text-xs">
            Anonymous counts kept by the store (no cookies needed). Overall conversion{" "}
            {pct(f.purchase, f.view_item)}.
          </p>
        </section>
      </div>

      <section aria-labelledby="top-h">
        <h2 id="top-h" className="text-xl">
          Top products
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr>
              <th className="py-1">Product</th>
              <th>Sold</th>
              <th className="text-right">Revenue (after discounts)</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {report.topProducts.map((p) => (
              <tr key={p.productId}>
                <td className="py-1.5">
                  <Link href={`/admin/products/${p.productId}`} className="hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td>{p.quantity}</td>
                <td className="text-right">{formatINR(p.revenueInPaise)}</td>
              </tr>
            ))}
            {report.topProducts.length === 0 && (
              <tr>
                <td colSpan={3} className="text-muted-foreground py-3">
                  No sales in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div className="grid gap-10 md:grid-cols-2">
        <section aria-labelledby="low-h">
          <h2 id="low-h" className="text-xl">
            Low stock ({lowStock.length})
          </h2>
          <p className="text-muted-foreground text-xs">
            Admins are emailed this list each morning (needs CRON_SECRET and email set up).
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {lowStock.map((p) => (
              <li key={p.id} className="flex justify-between">
                <Link href={`/admin/products/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                <span className={p.available === 0 ? "text-red-700" : "text-amber-700"}>
                  {p.available === 0 ? "Out of stock" : `${p.available} left`}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="export-h">
          <h2 id="export-h" className="text-xl">
            Export orders
          </h2>
          <form
            action="/api/admin/orders/export"
            method="get"
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <label className="text-sm">
              From
              <Input
                type="date"
                name="from"
                defaultValue={istDay(istMidnight(days - 1))}
                className="mt-1"
              />
            </label>
            <label className="text-sm">
              To
              <Input type="date" name="to" defaultValue={istDay(new Date())} className="mt-1" />
            </label>
            <Button type="submit" variant="outline">
              Download CSV
            </Button>
          </form>
          <p className="text-muted-foreground mt-2 text-xs">
            Paid, shipped, delivered, cancelled and refunded orders. Opens in Excel.
          </p>
        </section>
      </div>
    </div>
  );
}
