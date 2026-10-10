import Link from "next/link";
import { RETURN_REASON_LABEL } from "@/lib/returns";
import { listReturnsAdmin } from "@/services/return.service";
import { displayOrderNumber } from "@/services/order.service";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const FILTERS = [
  ["REQUESTED", "Waiting for review"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
  ["", "All"],
] as const;

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const status = (await searchParams).status ?? "REQUESTED";
  const returns = await listReturnsAdmin(status || undefined);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Returns</h1>
      <nav aria-label="Filter returns" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/admin/returns?status=${value}` : "/admin/returns?status="}
            aria-current={status === value ? "page" : undefined}
            className={`border-border rounded-md border px-3 py-1 ${status === value ? "bg-foreground text-background" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {returns.length === 0 ? (
        <p className="text-muted-foreground text-sm">No returns here.</p>
      ) : (
        <ul className="divide-border border-border divide-y rounded-md border text-sm">
          {returns.map((r) => (
            <li key={r.id}>
              <Link
                href={`/admin/orders/${r.order.id}`}
                className="hover:bg-muted flex flex-wrap justify-between gap-2 p-3"
              >
                <span>
                  Order {displayOrderNumber(r.order.id)} · {r.order.user.email}
                  <span className="text-muted-foreground block text-xs">
                    {RETURN_REASON_LABEL[r.reason]} · {r._count.items} item(s)
                  </span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {r.status} · {dateFmt.format(r.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
