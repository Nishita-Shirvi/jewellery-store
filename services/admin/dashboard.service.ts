import "server-only";
import { config } from "@/lib/config";
import { db } from "@/lib/db";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const LOW_STOCK_THRESHOLD = config.inventory.low_stock_threshold;

/** Midnight today in India, as a UTC Date. */
export function startOfTodayIST(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

export async function getDashboardStats() {
  const since = startOfTodayIST();
  const paidStatuses = ["PAID", "SHIPPED", "DELIVERED"] as const;

  const [ordersToday, revenue, awaitingShipment, lowStock] = await Promise.all([
    db.order.count({ where: { paidAt: { gte: since }, status: { in: [...paidStatuses] } } }),
    db.order.aggregate({
      where: { paidAt: { gte: since }, status: { in: [...paidStatuses] } },
      _sum: { totalInPaise: true },
    }),
    db.order.count({ where: { status: "PAID" } }),
    db.product.findMany({
      where: { isActive: true, stock: { lte: LOW_STOCK_THRESHOLD } },
      orderBy: [{ stock: "asc" }, { name: "asc" }],
      select: { id: true, name: true, stock: true },
      take: 20,
    }),
  ]);

  return {
    ordersToday,
    revenueTodayInPaise: revenue._sum.totalInPaise ?? 0,
    awaitingShipment,
    lowStock,
  };
}
