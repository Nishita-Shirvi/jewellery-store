import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { codOverview } from "@/services/cod.service";
import { displayOrderNumber } from "@/services/order.service";
import { markCashReceivedAction } from "../actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function AdminCodPage({
  searchParams,
}: {
  searchParams: Promise<{ recorded?: string; error?: string }>;
}) {
  const flash = await searchParams;
  const data = await codOverview();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cash on delivery</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The courier collects the cash and Shiprocket sends it to your bank account (remittance).
          When it arrives, tick the orders it covers and record it — they then count as paid in the
          reports, and returns can be refunded.
        </p>
      </div>

      {flash.recorded && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Recorded cash for {Number(flash.recorded) || 0} order(s).
        </p>
      )}
      {flash.error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {flash.error.slice(0, 200)}
        </p>
      )}

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="border-border rounded-md border p-4">
          <dt className="text-muted-foreground text-xs">Delivered, cash not recorded</dt>
          <dd className="mt-1 text-xl font-semibold" data-testid="cod-awaiting">
            {formatINR(data.awaitingCashInPaise)}
          </dd>
          <dd className="text-muted-foreground text-xs">{data.awaitingCash.length} order(s)</dd>
        </div>
        <div className="border-border rounded-md border p-4">
          <dt className="text-muted-foreground text-xs">Out for delivery / to ship</dt>
          <dd className="mt-1 text-xl font-semibold">{formatINR(data.inTransitInPaise)}</dd>
          <dd className="text-muted-foreground text-xs">{data.inTransitCount} order(s)</dd>
        </div>
        <div className="border-border rounded-md border p-4">
          <dt className="text-muted-foreground text-xs">Customers with refused COD parcels</dt>
          <dd className="mt-1 text-xl font-semibold">{data.refusedCustomers}</dd>
        </div>
      </dl>

      {data.awaitingCash.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No delivered COD orders are waiting for cash.
        </p>
      ) : (
        <form action={markCashReceivedAction} className="space-y-4" aria-label="Record cash">
          <div className="border-border overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="p-3">Order</th>
                  <th className="p-3">Delivered</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">AWB</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {data.awaitingCash.map((o) => (
                  <tr key={o.id}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        name="orderId"
                        value={o.id}
                        aria-label={`Cash received for ${displayOrderNumber(o.id)}`}
                      />
                    </td>
                    <td className="p-3">
                      <Link href={`/admin/orders/${o.id}`} className="underline underline-offset-4">
                        {displayOrderNumber(o.id)}
                      </Link>
                    </td>
                    <td className="p-3">{o.deliveredAt ? dateFmt.format(o.deliveredAt) : "—"}</td>
                    <td className="p-3">{o.user.email}</td>
                    <td className="p-3">{o.shipment?.awb ?? "—"}</td>
                    <td className="p-3 text-right">{formatINR(o.totalInPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="reference" className="text-sm font-medium">
                Remittance reference (optional)
              </label>
              <Input id="reference" name="reference" className="w-64" maxLength={120} />
            </div>
            <Button type="submit">Record cash received</Button>
          </div>
        </form>
      )}
    </div>
  );
}
