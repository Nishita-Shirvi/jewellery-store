import { formatINR } from "@/lib/format";
import type { OrderSummary } from "@/services/order.service";

export function OrderSummaryCard({ order }: { order: OrderSummary }) {
  return (
    <div className="border-border rounded-md border p-5 text-left text-sm">
      <ul className="space-y-2">
        {order.items.map((item) => (
          <li key={`${item.slug}:${item.sku}`} className="flex justify-between gap-4">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatINR(item.lineTotalInPaise)}</span>
          </li>
        ))}
      </ul>
      {order.codFeeInPaise > 0 && (
        <p className="mt-2 flex justify-between">
          <span>Cash on delivery fee</span>
          <span>{formatINR(order.codFeeInPaise)}</span>
        </p>
      )}
      <p className="border-border mt-4 flex justify-between border-t pt-4 font-semibold">
        <span>{order.paymentMethod === "COD" ? "Pay on delivery" : "Total"}</span>
        <span data-testid="order-total">{formatINR(order.totalInPaise)}</span>
      </p>
      <p className="text-muted-foreground mt-4">
        Delivering to {order.address.fullName}, {order.address.line1}, {order.address.city},{" "}
        {order.address.state} {order.address.pincode}
      </p>
    </div>
  );
}
