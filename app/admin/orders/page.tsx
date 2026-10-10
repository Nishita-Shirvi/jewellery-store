import Link from "next/link";
import { Pager } from "@/components/admin/pager";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/order-status";
import { adminListQuerySchema } from "@/lib/validation/admin";
import { listOrdersAdmin } from "@/services/admin/order-admin.service";
import { displayOrderNumber } from "@/services/order.service";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = adminListQuerySchema.parse(await searchParams);
  const { items, total, pageCount } = await listOrdersAdmin(query);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Orders <span className="text-muted-foreground text-base font-normal">({total})</span>
      </h1>
      <form className="mt-6 flex flex-wrap gap-2" action="/admin/orders" role="search">
        <Input
          name="q"
          defaultValue={query.q}
          placeholder="Order # or customer email"
          aria-label="Search orders"
          className="w-64"
        />
        <select
          name="status"
          defaultValue={query.status ?? ""}
          aria-label="Status"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <div className="border-border mt-6 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-muted-foreground text-left text-xs">
            <tr>
              <th className="p-3">Order</th>
              <th className="p-3">Date</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Items</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((o) => (
              <tr key={o.id}>
                <td className="p-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                    {displayOrderNumber(o.id)}
                  </Link>
                </td>
                <td className="text-muted-foreground p-3">{dateFmt.format(o.createdAt)}</td>
                <td className="p-3">
                  {o.user.name ?? "—"}
                  <br />
                  <span className="text-muted-foreground text-xs">{o.user.email}</span>
                </td>
                <td className="p-3">{o._count.items}</td>
                <td className="p-3">{formatINR(o.totalInPaise)}</td>
                <td className="p-3">
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground p-6 text-center">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager
        basePath="/admin/orders"
        params={{ q: query.q, status: query.status }}
        page={query.page}
        pageCount={pageCount}
      />
    </div>
  );
}
