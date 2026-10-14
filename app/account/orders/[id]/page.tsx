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
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { RefundList } from "@/components/returns/refund-list";
import { Button } from "@/components/ui/button";
import { RETURN_REASON_LABEL } from "@/lib/returns";
import {
  canCustomerCancel,
  getReturnOptions,
  getReturnsAndRefunds,
} from "@/services/return.service";
import { cancelOrderAction } from "../actions";
import { hasInvoice } from "@/services/invoice.service";

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

export default async function AccountOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; cancelled?: string; returned?: string }>;
}) {
  const { id } = await params;
  const flash = await searchParams;
  const user = await requireUserPage(`/account/orders/${id}`);
  const order = await getOrderForUser(user.id, id);
  if (!order || !CUSTOMER_VISIBLE_STATUSES.includes(order.status)) notFound();
  const [shipment, { returns, refunds }, cancellable, returnOptions] = await Promise.all([
    getShipmentForOrder(order.id),
    getReturnsAndRefunds(order.id),
    canCustomerCancel(order.id),
    getReturnOptions(user.id, order.id),
  ]);
  const invoiceReady = await hasInvoice(order.id);
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

      {order.status === "REFUND_PENDING" ||
      order.status === "REFUNDED" ||
      order.status === "RETURN_REQUESTED" ? null : order.status === "CANCELLED" ? (
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

      {flash.error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {flash.error.slice(0, 200)}
        </p>
      )}
      {flash.cancelled && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Your order is cancelled. The full refund is on its way to your original payment method.
        </p>
      )}
      {flash.returned && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Return request sent. We&apos;ll review it within 2 business days.
        </p>
      )}

      {(cancellable || returnOptions?.eligibility.ok || invoiceReady) && (
        <div className="flex flex-wrap gap-2">
          {invoiceReady && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/invoices/${order.id}`}>Download invoice</a>
            </Button>
          )}
          {cancellable && (
            <form action={cancelOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <ConfirmSubmit
                label="Cancel order"
                title="Cancel this order?"
                description="You'll get a full refund to your original payment method, usually within 5–7 business days."
                confirmLabel="Cancel order"
              />
            </form>
          )}
          {returnOptions?.eligibility.ok && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/account/orders/${order.id}/return`}>Return items</Link>
            </Button>
          )}
        </div>
      )}

      {(returns.length > 0 || refunds.length > 0) && (
        <section aria-labelledby="returns-heading" className="space-y-3">
          <h2 id="returns-heading" className="font-medium">
            Returns and refunds
          </h2>
          {returns.map((r) => (
            <div key={r.id} className="border-border rounded-md border p-3 text-sm">
              <p>
                Return{" "}
                {r.status === "REQUESTED"
                  ? "requested"
                  : r.status === "APPROVED"
                    ? "approved"
                    : "not approved"}{" "}
                · {RETURN_REASON_LABEL[r.reason]}
              </p>
              <p className="text-muted-foreground text-xs">
                {r.items.map((i) => `${i.orderItem.productName} × ${i.quantity}`).join(", ")}
              </p>
              {r.status === "REJECTED" && r.adminNote && (
                <p className="mt-1 text-xs">Reason: {r.adminNote}</p>
              )}
            </div>
          ))}
          <RefundList refunds={refunds} />
        </section>
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
              {(order.status === "DELIVERED" || order.status === "RETURN_REQUESTED") && (
                <Link
                  href={`/products/${item.slug}#reviews`}
                  className="ml-3 text-xs underline underline-offset-4"
                >
                  Write a review
                </Link>
              )}
            </span>
            <span>{formatINR(item.lineTotalInPaise)}</span>
          </li>
        ))}
        {order.discountInPaise > 0 && (
          <li className="flex justify-between p-4">
            <span className="text-muted-foreground">Coupon {order.couponCode}</span>
            <span>−{formatINR(order.discountInPaise)}</span>
          </li>
        )}
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
