import type { Refund } from "@prisma/client";
import { formatINR } from "@/lib/format";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const LABEL = {
  PENDING: "Processing",
  PROCESSED: "Refunded",
  FAILED: "Delayed — we're on it",
} as const;

export function RefundList({ refunds, admin = false }: { refunds: Refund[]; admin?: boolean }) {
  if (refunds.length === 0) return null;
  return (
    <ul
      className="divide-border border-border divide-y rounded-md border text-sm"
      aria-label="Refunds"
    >
      {refunds.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <span>
            {formatINR(r.amountInPaise)} · {r.reason}
            <span className="text-muted-foreground block text-xs">
              {dateFmt.format(r.createdAt)}
              {admin && r.razorpayRefundId ? ` · ${r.razorpayRefundId}` : ""}
              {admin && r.failureReason ? ` · ${r.failureReason}` : ""}
            </span>
          </span>
          <span
            data-testid="refund-status"
            className={
              r.status === "FAILED"
                ? "text-red-700"
                : r.status === "PROCESSED"
                  ? "text-emerald-700"
                  : ""
            }
          >
            {admin ? r.status : LABEL[r.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
