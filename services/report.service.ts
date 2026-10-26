import "server-only";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { PAID_STATUSES } from "@/lib/order-status";
import { dayRange, istDay, istMidnight, istWeekStart } from "@/lib/report/dates";

export const FUNNEL_EVENTS = ["view_item", "add_to_cart", "begin_checkout", "purchase"] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Anonymous daily counter (no personal data). Never throws. */
export async function countFunnel(event: FunnelEvent, at = new Date()) {
  try {
    await db.funnelDaily.upsert({
      where: { day_event: { day: istDay(at), event } },
      update: { count: { increment: 1 } },
      create: { day: istDay(at), event, count: 1 },
    });
  } catch {
    /* analytics must never break shopping */
  }
}

/** Sales report for the last `days` days (India time). Revenue = paid orders by payment date. */
export async function salesReport(days = 30) {
  const since = istMidnight(days - 1);
  const now = new Date();

  const [orders, refunds, items, funnel] = await Promise.all([
    db.order.findMany({
      where: { paidAt: { gte: since }, status: { in: PAID_STATUSES } },
      select: { paidAt: true, totalInPaise: true, discountInPaise: true, shippingInPaise: true },
    }),
    db.refund.findMany({
      where: { status: "PROCESSED", processedAt: { gte: since } },
      select: { amountInPaise: true, processedAt: true },
    }),
    db.orderItem.groupBy({
      by: ["productId", "productName"],
      where: { order: { paidAt: { gte: since }, status: { in: PAID_STATUSES } } },
      _sum: { quantity: true, lineTotalInPaise: true, discountInPaise: true },
      orderBy: { _sum: { lineTotalInPaise: "desc" } },
      take: 10,
    }),
    db.funnelDaily.findMany({ where: { day: { gte: istDay(since) } } }),
  ]);

  const byDay = new Map(
    dayRange(since, now).map((d) => [
      d,
      { day: d, orders: 0, revenueInPaise: 0, refundsInPaise: 0 },
    ]),
  );
  for (const o of orders) {
    const row = byDay.get(istDay(o.paidAt!));
    if (row) {
      row.orders += 1;
      row.revenueInPaise += o.totalInPaise;
    }
  }
  for (const r of refunds) {
    const row = byDay.get(istDay(r.processedAt!));
    if (row) row.refundsInPaise += r.amountInPaise;
  }
  const daily = [...byDay.values()];

  const weekly = new Map<string, { week: string; orders: number; revenueInPaise: number }>();
  for (const d of daily) {
    const w = istWeekStart(new Date(`${d.day}T12:00:00+05:30`));
    const row = weekly.get(w) ?? { week: w, orders: 0, revenueInPaise: 0 };
    row.orders += d.orders;
    row.revenueInPaise += d.revenueInPaise;
    weekly.set(w, row);
  }

  const funnelTotals = Object.fromEntries(
    FUNNEL_EVENTS.map((e) => [
      e,
      funnel.filter((f) => f.event === e).reduce((s, f) => s + f.count, 0),
    ]),
  ) as Record<FunnelEvent, number>;
  const grossInPaise = orders.reduce((s, o) => s + o.totalInPaise, 0);
  const refundedInPaise = refunds.reduce((s, r) => s + r.amountInPaise, 0);

  return {
    days,
    totals: {
      orders: orders.length,
      grossInPaise,
      refundedInPaise,
      netInPaise: grossInPaise - refundedInPaise,
      discountsInPaise: orders.reduce((s, o) => s + o.discountInPaise, 0),
      averageOrderInPaise: orders.length ? Math.round(grossInPaise / orders.length) : 0,
    },
    daily,
    weekly: [...weekly.values()],
    topProducts: items.map((i) => ({
      productId: i.productId,
      name: i.productName,
      quantity: i._sum.quantity ?? 0,
      revenueInPaise: (i._sum.lineTotalInPaise ?? 0) - (i._sum.discountInPaise ?? 0),
    })),
    funnel: funnelTotals,
  };
}

export const LOW_STOCK_ALERT_THRESHOLD = config.inventory.low_stock_threshold;

export async function lowStockProducts() {
  const rows = await db.product.findMany({
    where: { isActive: true },
    select: { id: true, name: true, stock: true, reservedStock: true },
    orderBy: { stock: "asc" },
  });
  return rows
    .map((r) => ({ ...r, available: Math.max(0, r.stock - r.reservedStock) }))
    .filter((r) => r.available <= LOW_STOCK_ALERT_THRESHOLD);
}

/** Orders in a date range for the CSV export, oldest first. */
export async function ordersForExport(from: Date, to: Date) {
  return db.order.findMany({
    where: { createdAt: { gte: from, lte: to }, status: { notIn: ["PENDING", "FAILED"] } },
    orderBy: { createdAt: "asc" },
    take: 20_000,
    include: {
      user: { select: { email: true } },
      items: { select: { productName: true, quantity: true } },
      invoice: { select: { number: true } },
    },
  });
}
