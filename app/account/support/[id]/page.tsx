import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CustomerReplyForm } from "@/components/support/support-forms";
import { requireUserPage } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { TICKET_STATUS_LABEL, displayTicketNumber, whatsappLink } from "@/lib/support";
import { cn } from "@/lib/utils";
import { displayOrderNumber } from "@/services/order.service";
import { getTicketForUser } from "@/services/support.service";
import { resolveTicketAction } from "../actions";

export const metadata: Metadata = { title: "Support request", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const user = await requireUserPage(`/account/support/${id}`);
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const ticket = await getTicketForUser(user.id, id);
  if (!ticket) notFound(); // also for someone else's ticket
  const number = displayTicketNumber(ticket.id);
  const whatsapp = whatsappLink(
    config.support.whatsapp_number,
    `Hello, about my request ${number}`,
  );

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <Link href="/account/support" className="text-muted-foreground text-sm hover:underline">
          ← All requests
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
        <p className="text-muted-foreground text-sm">
          {number} · <span data-testid="ticket-status">{TICKET_STATUS_LABEL[ticket.status]}</span>
          {ticket.order && (
            <>
              {" · "}
              <Link href={`/account/orders/${ticket.order.id}`} className="underline">
                Order {displayOrderNumber(ticket.order.id)}
              </Link>
            </>
          )}
        </p>
      </div>
      {created && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Thanks — we&apos;ve received your request and will reply by email, usually within a day.
        </p>
      )}

      <ol className="space-y-3" aria-label="Messages">
        {ticket.messages.map((m) => (
          <li
            key={m.id}
            className={cn(
              "rounded-md border p-4 text-sm",
              m.fromStaff ? "border-primary/30 bg-muted" : "border-border",
            )}
            data-testid="ticket-message"
          >
            <p className="text-muted-foreground mb-1 text-xs">
              {m.fromStaff ? "Store" : "You"} · {dateFmt.format(m.createdAt)}
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
                      {a.filename}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <CustomerReplyForm ticketId={ticket.id} />

      <div className="flex flex-wrap gap-3">
        {ticket.status !== "RESOLVED" && (
          <form action={resolveTicketAction}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <Button type="submit" variant="outline" size="sm">
              My problem is solved
            </Button>
          </form>
        )}
        {whatsapp && (
          <Button asChild variant="outline" size="sm">
            <a href={whatsapp} target="_blank" rel="noreferrer">
              Chat on WhatsApp
            </a>
          </Button>
        )}
      </div>
    </section>
  );
}
