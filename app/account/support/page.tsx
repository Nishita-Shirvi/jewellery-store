import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth-guards";
import { TICKET_STATUS_LABEL, displayTicketNumber } from "@/lib/support";
import { listTicketsForUser } from "@/services/support.service";

export const metadata: Metadata = { title: "Support", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function SupportListPage() {
  const user = await requireUserPage("/account/support");
  const tickets = await listTicketsForUser(user.id);
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
        <Button asChild>
          <Link href="/account/support/new">New request</Link>
        </Button>
      </div>
      {tickets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No requests yet. Try the{" "}
          <Link href="/help" className="underline">
            help centre
          </Link>
          , or send us a message.
        </p>
      ) : (
        <ul className="divide-border border-border divide-y rounded-md border text-sm">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/account/support/${t.id}`}
                className="hover:bg-muted flex justify-between gap-3 p-4"
              >
                <span>
                  <span className="font-medium">{t.subject}</span>{" "}
                  <span className="text-muted-foreground">{displayTicketNumber(t.id)}</span>
                </span>
                <span className="text-muted-foreground">
                  {TICKET_STATUS_LABEL[t.status]} · {dateFmt.format(t.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
