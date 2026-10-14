import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError, requireAdmin } from "@/lib/auth-guards";
import { csvRow } from "@/lib/report/csv";
import { istDay, istMidnight } from "@/lib/report/dates";
import { audit } from "@/services/audit.service";
import { displayOrderNumber } from "@/services/order.service";
import { ordersForExport } from "@/services/report.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/orders/export?from=2026-10-01&to=2026-10-31 → orders.csv (admins only). */
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const url = new URL(request.url);
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const from = valid(url.searchParams.get("from"))
    ? new Date(`${url.searchParams.get("from")}T00:00:00+05:30`)
    : istMidnight(29);
  const to = valid(url.searchParams.get("to"))
    ? new Date(`${url.searchParams.get("to")}T23:59:59.999+05:30`)
    : new Date();

  const orders = await ordersForExport(from, to);
  let csv =
    "\uFEFF" +
    csvRow([
      "Order",
      "Date (IST)",
      "Status",
      "Customer email",
      "Items",
      "Subtotal (₹)",
      "Discount (₹)",
      "Shipping (₹)",
      "Total (₹)",
      "Refunded (₹)",
      "Coupon",
      "Invoice",
      "State",
    ]);
  for (const o of orders) {
    const addr = o.addressSnapshot as { state?: string } | null;
    csv += csvRow([
      displayOrderNumber(o.id),
      istDay(o.createdAt),
      o.status,
      o.user.email,
      o.items.map((i) => `${i.productName} x${i.quantity}`).join("; "),
      (o.subtotalInPaise / 100).toFixed(2),
      (o.discountInPaise / 100).toFixed(2),
      (o.shippingInPaise / 100).toFixed(2),
      (o.totalInPaise / 100).toFixed(2),
      (o.refundedInPaise / 100).toFixed(2),
      o.couponCode ?? "",
      o.invoice?.number ?? "",
      addr?.state ?? "",
    ]);
  }
  await audit(admin, {
    action: "orders.export",
    entityType: "order",
    entityId: "export",
    summary: `Exported ${orders.length} orders (${istDay(from)} to ${istDay(to)})`,
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${istDay(from)}-to-${istDay(to)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
