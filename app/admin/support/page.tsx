import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/lib/auth-guards";
import { TICKET_CATEGORY_LABEL, TICKET_STATUS_LABEL, displayTicketNumber } from "@/lib/support";
import { cn } from "@/lib/utils";
import { listTicketsAdmin, type InboxFilter } from "@/services/support.service";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; who?: string }>;
}) {
  const staff = await requirePermissionPage("support.manage", "/admin/support");
  const sp = await searchParams;
  const filter: InboxFilter = {
    status: (["OPEN", "ANSWERED", "RESOLVED", "ALL"] as const).find((s) => s === sp.status),
    who: (["me", "unassigned", "all"] as const).find((w) => w === sp.who) ?? "all",
  };
  const tickets = await listTicketsAdmin(filter, staff.id);
  const overdue = tickets.filter((t) => t.overdue).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Support{" "}
          <span className="text-muted-foreground text-base font-normal">({tickets.length})</span>
        </h1>
        {overdue > 0 && (
          <p className="text-sm font-medium text-red-700" data-testid="overdue-count">
            {overdue} waiting more than 24 h
          </p>
        )}
      </div>
      <form className="flex flex-wrap gap-2" aria-label="Filter tickets">
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          aria-label="Status"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">Not resolved</option>
          <option value="OPEN">Waiting for us</option>
          <option value="ANSWERED">Answered</option>
          <option value="RESOLVED">Resolved</option>
          <option value="ALL">All</option>
        </select>
        <select
          name="who"
          defaultValue={filter.who}
          aria-label="Assigned to"
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="all">Everyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {tickets.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tickets here.</p>
      ) : (
        <ul className="divide-border border-border divide-y rounded-md border text-sm">
          {tickets.map((t) => (
            <li key={t.id} className={cn(t.overdue && "bg-red-50")} data-testid="ticket-row">
              <Link href={`/admin/support/${t.id}`} className="hover:bg-muted block p-4">
                <span className="flex flex-wrap justify-between gap-2">
                  <span>
                    {t.overdue && (
                      <span className="mr-2 rounded bg-red-700 px-1.5 py-0.5 text-xs text-white">
                        Over 24 h
                      </span>
                    )}
                    <span className="font-medium">{t.subject}</span>{" "}
                    <span className="text-muted-foreground">{displayTicketNumber(t.id)}</span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {TICKET_STATUS_LABEL[t.status]} · {TICKET_CATEGORY_LABEL[t.category]}
                  </span>
                </span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {t.user.email} · last message {dateFmt.format(t.lastCustomerMessageAt)} ·{" "}
                  {t.assignedTo
                    ? `assigned to ${t.assignedTo.name ?? t.assignedTo.email}`
                    : "unassigned"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
