import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { StatusBadge } from "@/components/admin/status-badge";
import { requireUserPage } from "@/lib/auth-guards";
import { formatINR } from "@/lib/format";
import { CUSTOMER_VISIBLE_STATUSES } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { getOrderForUser } from "@/services/order.service";
import { getShipmentForOrder } from "@/services/shipment.service";
import { TrackingTimeline } from "@/components/shipping/tracking-timeline";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "PAID", label: "Order confirmed" },
  { status: "SHIPPED", label: "Shipped" },
  { status: "DELIVERED", label: "Delivered" },
];

export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserPage(`/account/orders/${id}`);
  const order = await getOrderForUser(user.id, id);
  if (!order || !CUSTOMER_VISIBLE_STATUSES.includes(order.status)) notFound();
  const shipment = await getShipmentForOrder(order.id);
  const reached = STEPS.findIndex((s) => s.status === order.status);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/account/orders" className="text-muted-foreground text-sm hover:underline">
          ← Your orders
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Order {order.displayNumber}</h1>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-muted-foreground text-sm">Placed {dateFmt.format(order.createdAt)}</p>

      {order.status === "CANCELLED" ? (
        <p className="border-border bg-muted rounded-md border p-4 text-sm">
          This order was cancelled.
          {order.cancellationReason?.includes("refund")
            ? " Your payment will be refunded to the original payment method."
            : ""}
        </p>
      ) : (
        <ol className="grid grid-cols-3 gap-2 text-center text-xs" aria-label="Order progress">
          {STEPS.map((step, i) => (
            <li key={step.status} aria-current={i === reached ? "step" : undefined}>
              <div
                className={cn("h-1.5 rounded-full", i <= reached ? "bg-foreground" : "bg-muted")}
              />
              <span
                className={cn("mt-2 block", i <= reached ? "font-medium" : "text-muted-foreground")}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {shipment?.awb && (
        <section aria-labelledby="tracking-heading" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="tracking-heading" className="font-medium">
              Tracking · {shipment.courier} · {shipment.awb}
            </h2>
            {shipment.trackingUrl && (
              <a
                href={shipment.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline underline-offset-4"
              >
                Track on courier site
              </a>
            )}
          </div>
          <TrackingTimeline events={shipment.events} />
        </section>
      )}

      <ul className="divide-border border-border divide-y rounded-md border text-sm">
        {order.items.map((item) => (
          <li key={item.slug} className="flex justify-between gap-4 p-4">
            <span>
              <Link href={`/products/${item.slug}`} className="hover:underline">
                {item.name}
              </Link>{" "}
              × {item.quantity}
            </span>
            <span>{formatINR(item.lineTotalInPaise)}</span>
          </li>
        ))}
        <li className="flex justify-between p-4">
          <span className="text-muted-foreground">Shipping</span>
          <span>{order.shippingInPaise ? formatINR(order.shippingInPaise) : "Free"}</span>
        </li>
        <li className="flex justify-between p-4 font-semibold">
          <span>Total</span>
          <span>{formatINR(order.totalInPaise)}</span>
        </li>
      </ul>

      <div className="text-sm">
        <h2 className="font-medium">Delivery address</h2>
        <address className="text-muted-foreground mt-2 not-italic">
          {order.address.fullName} · {order.address.phone}
          <br />
          {order.address.line1}
          {order.address.line2 ? `, ${order.address.line2}` : ""}
          <br />
          {order.address.city}, {order.address.state} {order.address.pincode}
        </address>
      </div>
    </section>
  );
}
