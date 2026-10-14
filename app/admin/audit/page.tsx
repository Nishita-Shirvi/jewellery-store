import Link from "next/link";
import { Pager } from "@/components/admin/pager";
import { listAudit } from "@/services/audit.service";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const TYPES = ["", "product", "order", "coupon", "category", "review", "refund"] as const;

function entityLink(type: string, id: string) {
  if (type === "product") return `/admin/products/${id}`;
  if (type === "order" && id !== "export") return `/admin/orders/${id}`;
  if (type === "coupon") return `/admin/coupons/${id}`;
  return null;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const type = TYPES.includes((sp.type ?? "") as (typeof TYPES)[number]) ? (sp.type ?? "") : "";
  const page = Math.min(Math.max(1, Number(sp.page) || 1), 10_000);
  const { rows, pageCount } = await listAudit({ entityType: type || undefined, page });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Activity log</h1>
      <p className="text-muted-foreground text-sm">
        Every change made in the admin panel: who, what and when. Entries can&apos;t be edited or
        deleted.
      </p>
      <nav aria-label="Filter" className="flex flex-wrap gap-2 text-sm">
        {TYPES.map((t) => (
          <Link
            key={t || "all"}
            href={t ? `/admin/audit?type=${t}` : "/admin/audit"}
            aria-current={t === type ? "page" : undefined}
            className={`border-border rounded-md border px-3 py-1 capitalize ${t === type ? "bg-primary text-primary-foreground" : ""}`}
          >
            {t || "All"}
          </Link>
        ))}
      </nav>
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-muted-foreground text-left text-xs">
            <tr>
              <th className="p-3">When</th>
              <th className="p-3">Who</th>
              <th className="p-3">What</th>
              <th className="p-3">Changes</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => {
              const href = entityLink(r.entityType, r.entityId);
              const changes = (r.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
              return (
                <tr key={r.id} data-testid="audit-row">
                  <td className="text-muted-foreground p-3 whitespace-nowrap">
                    {dateFmt.format(r.createdAt)}
                  </td>
                  <td className="p-3">{r.actorEmail}</td>
                  <td className="p-3">
                    {href ? (
                      <Link href={href} className="hover:underline">
                        {r.summary}
                      </Link>
                    ) : (
                      r.summary
                    )}
                    <span className="text-muted-foreground block text-xs">{r.action}</span>
                  </td>
                  <td className="p-3 text-xs">
                    {Object.entries(changes).map(([k, v]) => (
                      <div key={k}>
                        {k}: {String(v.from)} → {String(v.to)}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted-foreground p-6 text-center">
                  Nothing logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager
        basePath="/admin/audit"
        params={{ type: type || undefined }}
        page={page}
        pageCount={pageCount}
      />
    </div>
  );
}
