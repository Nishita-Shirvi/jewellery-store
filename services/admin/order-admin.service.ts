import "server-only";
import { revalidateTag } from "next/cache";
import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { canTransition } from "@/lib/order-status";
import { AdminInputError, ADMIN_PAGE_SIZE } from "@/services/admin/product-admin.service";
import { CATALOG_TAG } from "@/services/catalog.service";
import { releaseReservation } from "@/services/inventory.service";

const STATUSES: OrderStatus[] = ["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED", "FAILED"];

export async function listOrdersAdmin(query: { page: number; status?: string; q?: string }) {
  const status = STATUSES.find((s) => s === query.status);
  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(query.q
      ? {
          OR: [
            { id: { endsWith: query.q.replace(/^#/, "").toLowerCase() } },
            { user: { email: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [total, items] = await db.$transaction([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * ADMIN_PAGE_SIZE,
      take: ADMIN_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        totalInPaise: true,
        createdAt: true,
        paidAt: true,
        user: { select: { email: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)) };
}

export async function getOrderAdmin(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      items: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
}

/**
 * Moves an order to a new status if the transition is allowed. Uses a conditional update so
 * two admins clicking at once can't both apply a change. Cancelling a PAID order puts the
 * stock back (refunds are done in the Razorpay dashboard until Phase 11 automates them).
 */
export async function updateOrderStatus(id: string, next: OrderStatus, adminId: string) {
  const order = await db.order.findUnique({ where: { id }, select: { status: true } });
  if (!order) throw new AdminInputError("Order not found.");
  if (!canTransition(order.status, next)) {
    throw new AdminInputError(`Can't change an order from ${order.status} to ${next}.`);
  }

  await db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id, status: order.status },
      data: {
        status: next,
        ...(next === "CANCELLED"
          ? {
              cancellationReason:
                order.status === "PAID"
                  ? "Cancelled by admin — refund the payment in the Razorpay dashboard"
                  : "Cancelled by admin",
            }
          : {}),
      },
    });
    if (updated.count === 0)
      throw new AdminInputError("The order changed in the meantime. Refresh and try again.");

    if (next === "CANCELLED" && order.status !== "PAID") {
      await releaseReservation(tx, id); // unpaid order: give held stock back
    }
    if (next === "CANCELLED" && order.status === "PAID") {
      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
  });

  if (next === "CANCELLED" && order.status === "PAID") revalidateTag(CATALOG_TAG);
  logger.info("admin.order_status_changed", { adminId, orderId: id, from: order.status, to: next });
}
