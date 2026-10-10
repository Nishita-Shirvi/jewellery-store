import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/format";
import { ADMIN_TRANSITIONS, STATUS_LABEL } from "@/lib/order-status";
import type { AddressSnapshot } from "@/services/address.service";
import { getOrderAdmin } from "@/services/admin/order-admin.service";
import { displayOrderNumber } from "@/services/order.service";
import { createShipmentAction, updateOrderStatusAction } from "../../actions";
import { SHIPMENT_LABEL, TrackingTimeline } from "@/components/shipping/tracking-timeline";
import { isShiprocketConfigured } from "@/lib/env";
import { getShipmentForOrder } from "@/services/shipment.service";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  SHIPPED: "Mark as shipped",
  DELIVERED: "Mark as delivered",
  CANCELLED: "Cancel order",
};

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; shipped?: string }>;
}) {
  const { id } = await params;
  const { error, shipped } = await searchParams;
  const [order, shipment] = await Promise.all([getOrderAdmin(id), getShipmentForOrder(id)]);
  if (!order) notFound();
  const canCreateShipment =
    order.status === "PAID" &&
    (!shipment || !shipment.awb || shipment.status === "AWB_ASSIGNED" || !shipment.labelUrl);
  const address = order.addressSnapshot as AddressSnapshot;
  const next = ADMIN_TRANSITIONS[order.status];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/orders" className="text-muted-foreground text-sm hover:underline">
          ← Orders
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Order {displayOrderNumber(order.id)}
        </h1>
        <StatusBadge status={order.status} />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error.slice(0, 200)}
        </p>
      )}
      {order.cancellationReason && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {order.cancellationReason}
        </p>
      )}

      {next.length > 0 && (
        <section aria-labelledby="actions-heading" className="flex flex-wrap items-center gap-2">
          <h2 id="actions-heading" className="sr-only">
            Change status
          </h2>
          {next.map((status) => (
            <form key={status} action={updateOrderStatusAction}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="status" value={status} />
              {status === "CANCELLED" ? (
                <ConfirmSubmit
                  label={ACTION_LABEL[status] ?? STATUS_LABEL[status]}
                  title="Cancel this order?"
                  description={
                    order.status === "PAID"
                      ? "Stock will be put back. You must also refund the customer in the Razorpay dashboard (automatic refunds arrive in Phase 11)."
                      : "The order will be closed. This can't be undone."
                  }
                  confirmLabel="Cancel order"
                />
              ) : (
                <Button type="submit" size="sm">
                  {ACTION_LABEL[status] ?? STATUS_LABEL[status]}
                </Button>
              )}
            </form>
          ))}
        </section>
      )}

      {shipped && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Shipment created. Print the label and keep the parcel ready for pickup.
        </p>
      )}

      <section aria-labelledby="shipping-heading" className="border-border rounded-md border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="shipping-heading" className="font-medium">
            Shipping
          </h2>
          {canCreateShipment && (
            <form action={createShipmentAction}>
              <input type="hidden" name="id" value={order.id} />
              <Button type="submit" size="sm" disabled={!isShiprocketConfigured}>
                {shipment ? "Retry shipment" : "Create shipment"}
              </Button>
            </form>
          )}
        </div>
        {!isShiprocketConfigured && order.status === "PAID" && (
          <p className="text-muted-foreground mt-2 text-xs">
            Shiprocket isn&apos;t set up — add the SHIPROCKET_* keys, or ship manually and use “Mark
            as shipped”.
          </p>
        )}
        {shipment ? (
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd data-testid="shipment-status">{SHIPMENT_LABEL[shipment.status]}</dd>
              <dt className="text-muted-foreground">Courier</dt>
              <dd>{shipment.courier ?? "—"}</dd>
              <dt className="text-muted-foreground">AWB</dt>
              <dd data-testid="shipment-awb">{shipment.awb ?? "—"}</dd>
              <dt className="text-muted-foreground">Label</dt>
              <dd>
                {shipment.labelUrl ? (
                  <a
                    href={shipment.labelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Download label (PDF)
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">Tracking</dt>
              <dd>
                {shipment.trackingUrl ? (
                  <a
                    href={shipment.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Open tracking page
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            <TrackingTimeline events={shipment.events} />
            {shipment.lastError && (
              <p role="alert" className="text-xs text-red-700 md:col-span-2">
                Last problem: {shipment.lastError}
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">No shipment yet.</p>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="font-medium">Customer</h2>
          <p className="mt-2 text-sm">
            {order.user.name ?? "—"} · {order.user.email}
          </p>
          <h2 className="mt-6 font-medium">Delivery address</h2>
          <address className="mt-2 text-sm not-italic">
            {address.fullName} · {address.phone}
            <br />
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}
            <br />
            {address.landmark ? (
              <>
                {address.landmark}
                <br />
              </>
            ) : null}
            {address.city}, {address.state} {address.pincode}
          </address>
        </section>
        <section>
          <h2 className="font-medium">Timeline</h2>
          <dl className="mt-2 grid grid-cols-[120px_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">Placed</dt>
            <dd>{dateFmt.format(order.createdAt)}</dd>
            <dt className="text-muted-foreground">Paid</dt>
            <dd>{order.paidAt ? dateFmt.format(order.paidAt) : "—"}</dd>
            <dt className="text-muted-foreground">Last update</dt>
            <dd>{dateFmt.format(order.updatedAt)}</dd>
          </dl>
          <h2 className="mt-6 font-medium">Payments</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {order.payments.map((p) => (
              <li key={p.id}>
                {p.status} · {formatINR(p.amountInPaise)} · {p.method ?? "—"}
                <br />
                <span className="text-muted-foreground text-xs">
                  {p.providerOrderId}
                  {p.providerPaymentId ? ` / ${p.providerPaymentId}` : ""}
                </span>
                {p.failureReason && (
                  <span className="block text-xs text-red-700">{p.failureReason}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <h2 className="font-medium">Items</h2>
        <div className="border-border mt-3 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted text-muted-foreground text-left text-xs">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Price</th>
                <th className="p-3">Qty</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td className="p-3">
                    {i.productName}
                    <br />
                    <span className="text-muted-foreground text-xs">
                      {(i.productSnapshot as { materialSummary?: string }).materialSummary}
                    </span>
                  </td>
                  <td className="p-3">{formatINR(i.priceInPaise)}</td>
                  <td className="p-3">{i.quantity}</td>
                  <td className="p-3 text-right">{formatINR(i.lineTotalInPaise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-border border-t text-sm">
              <tr>
                <td colSpan={3} className="text-muted-foreground p-3 text-right">
                  Shipping
                </td>
                <td className="p-3 text-right">{formatINR(order.shippingInPaise)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="p-3 text-right font-semibold">
                  Total
                </td>
                <td className="p-3 text-right font-semibold">{formatINR(order.totalInPaise)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
