import "server-only";
import { Prisma, type ShipmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AdminInputError } from "@/services/admin/product-admin.service";
import { updateOrderStatus } from "@/services/admin/order-admin.service";

/**
 * Manual delivery tracking — for when no courier service (Shiprocket) is connected yet, or a
 * parcel goes with a courier we have no link to. The owner types the courier, tracking number and
 * link, then posts updates ("In transit", "Out for delivery", "Delivered"). Customers see them in
 * the same timeline Shiprocket would fill, and get the usual shipped / delivered emails.
 */

export const MANUAL_UPDATE_STATUSES = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const satisfies readonly ShipmentStatus[];
export type ManualUpdateStatus = (typeof MANUAL_UPDATE_STATUSES)[number];

export const MANUAL_UPDATE_LABEL: Record<ManualUpdateStatus, string> = {
  PICKED_UP: "Picked up by the courier",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
};

const SHIPPABLE = ["PAID", "CONFIRMED", "SHIPPED"] as const;

/** Adds (or corrects) the courier and tracking details; marks the order shipped if it wasn't. */
export async function saveManualTracking(
  orderId: string,
  input: { courier: string; awb?: string | null; trackingUrl?: string | null },
  adminId: string,
) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true, shipment: { select: { id: true, provider: true } } },
  });
  if (!order) throw new AdminInputError("Order not found.");
  if (!(SHIPPABLE as readonly string[]).includes(order.status))
    throw new AdminInputError("Only paid / confirmed or shipped orders can get tracking details.");
  if (order.shipment && order.shipment.provider !== "MANUAL")
    throw new AdminInputError(
      "This order already has a Shiprocket shipment; its tracking updates by itself.",
    );

  const data = {
    courier: input.courier,
    awb: input.awb || null,
    trackingUrl: input.trackingUrl || null,
  };
  try {
    await db.$transaction(async (tx) => {
      const shipment = await tx.shipment.upsert({
        where: { orderId },
        create: { orderId, provider: "MANUAL", status: "AWB_ASSIGNED", ...data },
        update: data,
        select: { id: true },
      });
      if (!order.shipment)
        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            status: "AWB_ASSIGNED",
            label: `Handed to ${input.courier}`,
            occurredAt: new Date(),
          },
        });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AdminInputError("That tracking number is already used by another order.");
    throw error;
  }
  // Shipped email to the customer (and COD / stock rules) through the normal status change.
  if (order.status !== "SHIPPED") await updateOrderStatus(orderId, "SHIPPED", adminId);
  logger.info("shipping.manual_tracking_saved", { orderId, adminId });
}

/** Posts a delivery update the customer sees; "Delivered" also completes the order. */
export async function addManualUpdate(
  orderId: string,
  input: { status: ManualUpdateStatus; note?: string | null; location?: string | null },
  adminId: string,
) {
  const shipment = await db.shipment.findUnique({
    where: { orderId },
    select: { id: true, provider: true, status: true, order: { select: { status: true } } },
  });
  if (!shipment) throw new AdminInputError("Add the courier and tracking details first.");
  if (shipment.provider !== "MANUAL")
    throw new AdminInputError("This shipment updates from Shiprocket automatically.");
  if (shipment.status === "DELIVERED")
    throw new AdminInputError("This parcel is already delivered.");

  const now = new Date();
  await db.$transaction([
    db.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        status: input.status,
        label: input.note || MANUAL_UPDATE_LABEL[input.status],
        location: input.location || null,
        occurredAt: now,
      },
    }),
    db.shipment.update({ where: { id: shipment.id }, data: { status: input.status } }),
  ]);
  if (input.status === "DELIVERED" && shipment.order.status === "SHIPPED")
    await updateOrderStatus(orderId, "DELIVERED", adminId);
  logger.info("shipping.manual_update", { orderId, status: input.status, adminId });
}
