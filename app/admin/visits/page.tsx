import Link from "next/link";
import type { VisitStatus } from "@prisma/client";
import { Pager } from "@/components/admin/pager";
import { Button } from "@/components/ui/button";
import { adminListQuerySchema } from "@/lib/validation/admin";
import { listVisitRequests } from "@/services/visit.service";
import { updateVisitStatusAction } from "../storefront-actions";

export const dynamic = "force-dynamic";

const STATUSES: VisitStatus[] = ["NEW", "CONFIRMED", "COMPLETED", "CANCELLED"];
const LABEL: Record<VisitStatus, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  COMPLETED: "Visited",
  CANCELLED: "Cancelled",
};
const day = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export default async function AdminVisitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = adminListQuerySchema.parse(await searchParams);
  const status = STATUSES.includes(query.status as VisitStatus)
    ? (query.status as VisitStatus)
    : undefined;
  const { items, total, pageCount } = await listVisitRequests({ status, page: query.page });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        Showroom visits{" "}
        <span className="text-muted-foreground text-base font-normal">({total})</span>
      </h1>
      <nav aria-label="Filter visits" className="mt-4 flex flex-wrap gap-2 text-sm">
        {[undefined, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/admin/visits?status=${s}` : "/admin/visits"}
            aria-current={status === s ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${status === s ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {s ? LABEL[s] : "All"}
          </Link>
        ))}
      </nav>

      <ul className="mt-6 space-y-3">
        {items.map((v) => (
          <li key={v.id} className="border-border rounded-md border p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {day.format(v.preferredDate)} · {v.timeSlot}
              </p>
              <span className="text-muted-foreground text-xs">{LABEL[v.status]}</span>
            </div>
            <p className="mt-1">
              {v.name} ·{" "}
              <a className="underline" href={`tel:+91${v.phone}`}>
                {v.phone}
              </a>
              {v.email && (
                <>
                  {" "}
                  ·{" "}
                  <a className="underline" href={`mailto:${v.email}`}>
                    {v.email}
                  </a>
                </>
              )}
            </p>
            {v.product && (
              <p className="mt-1">
                Wants to see:{" "}
                <Link href={`/products/${v.product.slug}`} className="underline" target="_blank">
                  {v.product.name}
                </Link>
              </p>
            )}
            {v.message && (
              <p className="text-muted-foreground mt-1 whitespace-pre-line">{v.message}</p>
            )}
            <form action={updateVisitStatusAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={v.id} />
              <label className="text-xs">
                <span className="sr-only">Status</span>
                <select
                  name="status"
                  defaultValue={v.status}
                  className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-48 flex-1 text-xs">
                <span className="sr-only">Note</span>
                <input
                  name="adminNote"
                  defaultValue={v.adminNote ?? ""}
                  placeholder="Note (only admins see this)"
                  maxLength={500}
                  className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
                />
              </label>
              <Button type="submit" size="sm" variant="outline">
                Update
              </Button>
            </form>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-muted-foreground border-border rounded-md border border-dashed p-6 text-center text-sm">
            No visit requests.
          </li>
        )}
      </ul>
      <Pager basePath="/admin/visits" params={{ status }} page={query.page} pageCount={pageCount} />
    </div>
  );
}
