import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderSummaryCard } from "@/components/checkout/order-summary-card";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth-guards";
import { getOrderForUser } from "@/services/order.service";
import { TrackEvent } from "@/components/analytics/track-event";

export const metadata: Metadata = { title: "Order confirmed", robots: { index: false } };

export default async function OrderSuccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/orders/${id}/success`);
  const order = await getOrderForUser(user.id, id);
  if (!order) notFound();
  if (order.status === "FAILED" || order.status === "CANCELLED") redirect(`/orders/${id}/failed`);

  const paid = order.status !== "PENDING";

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      {paid ? (
        <>
          <h1 className="text-2xl font-semibold">Thank you! Your order is confirmed.</h1>
          <p className="text-muted-foreground mt-2">
            Order {order.displayNumber}. A confirmation email is on its way.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Confirming your payment…</h1>
          <p className="text-muted-foreground mt-2">
            This usually takes a few seconds. Refresh this page in a moment.
          </p>
        </>
      )}
      {paid && (
        <TrackEvent
          name="purchase"
          params={{
            transaction_id: order.id,
            currency: "INR",
            value: order.totalInPaise / 100,
            shipping: order.shippingInPaise / 100,
            items: order.items.map((i) => ({
              item_id: i.slug,
              item_name: i.name,
              quantity: i.quantity,
              price: i.priceInPaise / 100,
            })),
          }}
        />
      )}
      <div className="mt-8">
        <OrderSummaryCard order={order} />
      </div>
      <div className="mt-8 flex justify-center gap-3">
        <Button asChild variant="outline">
          <Link href={`/account/orders/${order.id}`}>View order</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}
