import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderSummaryCard } from "@/components/checkout/order-summary-card";
import { PayButton } from "@/components/checkout/pay-button";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth-guards";
import { publicEnv } from "@/lib/env";
import { formatINR } from "@/lib/format";
import { getOrderForUser } from "@/services/order.service";

export const metadata: Metadata = { title: "Payment not completed", robots: { index: false } };

export default async function OrderFailedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { id } = await params;
  const { reason } = await searchParams;
  const user = await requireUserPage(`/orders/${id}/failed`);
  const order = await getOrderForUser(user.id, id);
  if (!order) notFound();
  if (order.status === "PAID" || order.status === "SHIPPED" || order.status === "DELIVERED") {
    redirect(`/orders/${id}/success`);
  }

  const soldOut = order.status === "CANCELLED";
  const canRetry = order.status === "PENDING" || order.status === "FAILED";

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        {soldOut ? "Sorry, this piece just sold out" : "Payment not completed"}
      </h1>
      <p className="text-muted-foreground mt-2">
        {soldOut
          ? "Someone completed their purchase a moment before you. Your payment will be refunded in full."
          : `No money was taken for order ${order.displayNumber}.${reason && reason !== "sold_out" ? ` Reason: ${reason.slice(0, 120)}` : ""}`}
      </p>
      <div className="mt-8">
        <OrderSummaryCard order={order} />
      </div>
      <div className="mx-auto mt-8 max-w-xs space-y-3">
        {canRetry && (
          <PayButton
            label={`Try again · ${formatINR(order.totalInPaise)}`}
            storeName={publicEnv.NEXT_PUBLIC_SITE_NAME}
            orderId={order.id}
          />
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href="/cart">Back to cart</Link>
        </Button>
      </div>
    </div>
  );
}
