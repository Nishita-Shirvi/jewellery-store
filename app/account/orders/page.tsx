import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Pager } from "@/components/admin/pager";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth-guards";
import { formatINR } from "@/lib/format";
import { listOrdersForUser } from "@/services/order.service";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUserPage("/account/orders");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .catch(1)
    .parse((await searchParams).page ?? 1);
  const { orders, pageCount } = await listOrdersForUser(user.id, page);

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Your orders</h1>
      {orders.length === 0 ? (
        <div className="border-border mt-8 rounded-md border border-dashed p-10 text-center">
          <p className="font-medium">No orders yet</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/products">Start shopping</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-border border-border mt-6 divide-y rounded-md border">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/account/orders/${o.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium">Order {o.displayNumber}</p>
                  <p className="text-muted-foreground text-xs">
                    {dateFmt.format(o.createdAt)} · {o.items.map((i) => i.productName).join(", ")}
                    {o._count.items > o.items.length
                      ? ` +${o._count.items - o.items.length} more`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={o.status} />
                  <span className="font-semibold">{formatINR(o.totalInPaise)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager basePath="/account/orders" params={{}} page={page} pageCount={pageCount} />
    </section>
  );
}
