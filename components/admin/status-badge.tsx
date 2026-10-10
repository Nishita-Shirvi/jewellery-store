import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/order-status";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={cn(
        "inline-block rounded border px-2 py-0.5 text-xs font-medium",
        STATUS_TONE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
