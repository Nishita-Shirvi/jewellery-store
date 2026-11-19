import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StaffReplyForm } from "@/components/support/support-forms";
import { requirePermissionPage } from "@/lib/auth-guards";
import { formatINR } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/order-status";
import {
  TICKET_CATEGORY_LABEL,
  TICKET_STATUS_LABEL,
  displayTicketNumber,
  isOverdue,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import { displayOrderNumber } from "@/services/order.service";
import { getTicketAdmin, listCannedReplies, supportAgents } from "@/services/support.service";
import { assignTicketAction, setTicketStatusAction } from "../../actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function AdminTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const staff = await requirePermissionPage("support.manage", "/admin/support");
  const { error } = await searchParams;
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const [ticket, canned, agents] = await Promise.all([
    getTicketAdmin(id),
    listCannedReplies(),
    supportAgents(),
  ]);
  if (!ticket) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/support" className="text-muted-foreground text-sm hover:underline">
          ← Support
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
        <p className="text-muted-foreground text-sm">
          {displayTicketNumber(ticket.id)} · {TICKET_CATEGORY_LABEL[ticket.category]} ·{" "}
          <span data-testid="admin-ticket-status">{TICKET_STATUS_LABEL[ticket.status]}</span> ·{" "}
          {ticket.user.name ?? ""} {ticket.user.email}
          {isOverdue(ticket) && <span className="ml-2 font-medium text-red-700">Over 24 h</span>}
        </p>
        {ticket.order && (
          <p className="mt-1 text-sm">
            Order{" "}
            <Link href={`/admin/orders/${ticket.order.id}`} className="underline">
              {displayOrderNumber(ticket.order.id)}
            </Link>{" "}
            · {STATUS_LABEL[ticket.order.status]} · {formatINR(ticket.order.totalInPaise)}
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error.slice(0, 200)}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form action={assignTicketAction} className="flex items-end gap-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <label className="space-y-1 text-sm">
            <span className="block">Assigned to</span>
            <select
              name="assigneeId"
              defaultValue={ticket.assignedTo?.id ?? ""}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">Nobody</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id === staff.id ? "Me" : (a.name ?? a.email)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm" variant="outline">
            Assign
          </Button>
        </form>
        {(["OPEN", "RESOLVED"] as const)
          .filter((s) => s !== ticket.status)
          .map((s) => (
            <form key={s} action={setTicketStatusAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <input type="hidden" name="ticketStatus" value={s} />
              <Button type="submit" size="sm" variant="outline">
                {s === "RESOLVED" ? "Mark resolved" : "Reopen"}
              </Button>
            </form>
          ))}
      </div>

      <ol className="space-y-3" aria-label="Messages">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "rounded-md border p-4 text-sm",
              m.internal
                ? "border-amber-300 bg-amber-50"
                : m.fromStaff
                  ? "border-primary/30 bg-muted"
                  : "border-border",
            )}
            data-testid="admin-ticket-message"
          >
            <p className="text-muted-foreground mb-1 text-xs">
              {m.internal ? "Internal note" : m.fromStaff ? "Store" : "Customer"} ·{" "}
              {dateFmt.format(m.createdAt)}
            </p>
            <p className="whitespace-pre-line">{m.body}</p>
            {m.attachments.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-3 text-xs">
                {m.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/support/attachments/${a.id}`}
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.filename} ({Math.ceil(a.size / 1024)} KB)
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <StaffReplyForm ticketId={ticket.id} canned={canned} />
    </div>
  );
}
