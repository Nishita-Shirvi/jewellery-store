import type { Metadata } from "next";
import { NewTicketForm } from "@/components/support/support-forms";
import { requireUserPage } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { displayOrderNumber } from "@/services/order.service";

export const metadata: Metadata = { title: "Contact support", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; category?: string }>;
}) {
  const { orderId, category } = await searchParams;
  const user = await requireUserPage("/account/support/new");
  const orders = await db.order.findMany({
    where: { userId: user.id, status: { notIn: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, totalInPaise: true },
  });
  return (
    <section className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Contact support</h1>
      <NewTicketForm
        orders={orders.map((o) => ({
          id: o.id,
          label: `${displayOrderNumber(o.id)} · ${dateFmt.format(o.createdAt)} · ${formatINR(o.totalInPaise)}`,
        }))}
        orderId={orders.some((o) => o.id === orderId) ? orderId : undefined}
        category={category}
      />
    </section>
  );
}
