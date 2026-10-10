import { formatINR } from "@/lib/format";
import type { OrderSummary } from "@/services/order.service";

export function OrderSummaryCard({ order }: { order: OrderSummary }) {
  return (
    <div className="border-border rounded-md border p-5 text-left text-sm">
      <ul className="space-y-2">
        {order.items.map((item) => (
          <li key={item.slug} className="flex justify-between gap-4">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatINR(item.lineTotalInPaise)}</span>
          </li>
        ))}
      </ul>
      <p className="border-border mt-4 flex justify-between border-t pt-4 font-semibold">
        <span>Total</span>
        <span>{formatINR(order.totalInPaise)}</span>
      </p>
      <p className="text-muted-foreground mt-4">
        Delivering to {order.address.fullName}, {order.address.line1}, {order.address.city},{" "}
        {order.address.state} {order.address.pincode}
      </p>
    </div>
  );
}
