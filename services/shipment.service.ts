import "server-only";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { env, isShiprocketConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  ShiprocketError,
  assignAwb,
  checkServiceability,
  codCollectAmount,
  createShiprocketOrder,
  generateLabel,
  mapShiprocketStatus,
  requestPickup,
  trackingUrlFor,
} from "@/lib/shipping/shiprocket";
import { lineName } from "@/lib/variants";
import { READY_TO_SHIP_STATUSES } from "@/lib/order-status";
import { restockLines } from "@/services/inventory.service";
import { openSnapshot } from "@/services/address.service";

function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Higher = further along. Tracking updates never move a shipment backwards. */
const RANK: Record<ShipmentStatus, number> = {
  CREATED: 0,
  AWB_ASSIGNED: 1,
  PICKUP_SCHEDULED: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 4,
  OUT_FOR_DELIVERY: 5,
  DELIVERED: 6,
  CANCELLED: 6,
  RTO: 7,
};

export class ShipmentError extends Error {}

/**
 * "Create Shipment" for a PAID order: Shiprocket order → courier + AWB → label → pickup.
 * Each finished step is saved, so pressing the button again after a failure resumes
 * where it stopped instead of creating a duplicate parcel.
 */
export async function createShipmentForOrder(orderId: string, adminId: string) {
  if (!isShiprocketConfigured)
    throw new ShipmentError("Shiprocket isn't set up yet. Add the SHIPROCKET_* keys to .env.");

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true, name: true } },
      items: { include: { variant: { select: { netWeightMg: true, grossWeightMg: true } } } },
      shipment: true,
    },
  });
  if (!order) throw new ShipmentError("Order not found.");
  if (
    !READY_TO_SHIP_STATUSES.includes(order.status) &&
    !(order.status === "SHIPPED" && order.shipment && !order.shipment.awb)
  ) {
    throw new ShipmentError(
      "Only paid or confirmed (cash on delivery) orders that haven't shipped can get a shipment.",
    );
  }

  let shipment = order.shipment ?? (await db.shipment.create({ data: { orderId } }));
  const address = openSnapshot(order.addressSnapshot);

  try {
    if (!shipment.providerShipmentId) {
      const weightGrams = order.items.reduce(
        (sum, i) =>
          sum + Math.ceil((i.variant.grossWeightMg ?? i.variant.netWeightMg) / 1000) * i.quantity,
        0,
      );
      const request = {
        orderId: order.id,
        orderDate: order.paidAt ?? order.createdAt,
        customer: { name: address.fullName, email: order.user.email, phone: address.phone },
        address,
        items: order.items.map((i) => ({
          name: lineName(i.productName, i.variantLabel),
          // Each variant has its own SKU, so two sizes of one ring are two lines at Shiprocket.
          sku: i.sku || i.productSlug,
          units: i.quantity,
          sellingPriceInPaise: i.priceInPaise,
        })),
        subTotalInPaise: order.subtotalInPaise,
        shippingInPaise: order.shippingInPaise,
        weightGrams: weightGrams + 200, // box and packing
        ...(order.paymentMethod === "COD"
          ? { cod: { feeInPaise: order.codFeeInPaise, discountInPaise: order.discountInPaise } }
          : {}),
      };
      // The courier must collect exactly the order total — never more, never less.
      if (order.paymentMethod === "COD" && codCollectAmount(request) !== order.totalInPaise)
        throw new ShipmentError(
          "COD amount doesn't match the order total. Not sent to Shiprocket.",
        );
      const created = await createShiprocketOrder(request);
      shipment = await db.shipment.update({
        where: { id: shipment.id },
        data: {
          providerOrderId: String(created.order_id),
          providerShipmentId: String(created.shipment_id),
          lastError: null,
        },
      });
      logger.info("shipment.provider_order_created", { orderId, shipmentId: created.shipment_id });
    }

    const providerShipmentId = shipment.providerShipmentId!;
    if (!shipment.awb) {
      const { awb, courier } = await assignAwb(providerShipmentId);
      shipment = await db.shipment.update({
        where: { id: shipment.id },
        data: {
          awb,
          courier,
          trackingUrl: trackingUrlFor(awb),
          status: "AWB_ASSIGNED",
          lastError: null,
        },
      });
      logger.info("shipment.awb_assigned", { orderId, awb, courier });
    }

    if (!shipment.labelUrl) {
      const labelUrl = await generateLabel(providerShipmentId);
      shipment = await db.shipment.update({
        where: { id: shipment.id },
        data: { labelUrl, lastError: null },
      });
    }

    if (RANK[shipment.status] < RANK.PICKUP_SCHEDULED) {
      await requestPickup(providerShipmentId);
      shipment = await db.shipment.update({
        where: { id: shipment.id },
        data: { status: "PICKUP_SCHEDULED", lastError: null },
      });
    }

    logger.info("shipment.ready", { orderId, adminId, awb: shipment.awb });
    return shipment;
  } catch (error) {
    const message =
      error instanceof ShiprocketError || error instanceof ShipmentError
        ? error.message.replace(/\.$/, "")
        : "Unexpected error talking to Shiprocket";
    await db.shipment.update({
      where: { id: shipment.id },
      data: { lastError: message.slice(0, 300) },
    });
    logger.error("shipment.create_failed", { orderId, error });
    throw new ShipmentError(
      `${message}. Fix the problem and press the button again — finished steps won't be repeated.`,
    );
  }
}

export interface TrackingUpdate {
  awb: string;
  statusId?: number | null;
  statusLabel?: string | null;
  occurredAt: Date;
  location?: string | null;
  scans: { label: string; statusId?: number | null; location?: string | null; occurredAt: Date }[];
  raw: Prisma.InputJsonValue;
}

/**
 * Applies a tracking webhook. Idempotent (timeline rows are unique), order-independent
 * (never moves backwards) and moves the order: picked up / in transit → SHIPPED, delivered → DELIVERED.
 */
export async function applyTrackingUpdate(
  update: TrackingUpdate,
): Promise<"applied" | "unknown_awb" | "no_change"> {
  const shipment = await db.shipment.findUnique({
    where: { awb: update.awb },
    select: { id: true, orderId: true, status: true },
  });
  if (!shipment) return "unknown_awb";

  // Scans carry the detailed history; the top-level status is used only when there are no scans.
  const events = (
    update.scans.length > 0
      ? update.scans.map((scan) => ({
          ...scan,
          status: mapShiprocketStatus(scan.statusId, scan.label),
        }))
      : [
          {
            label: titleCase(update.statusLabel ?? "Status update"),
            statusId: update.statusId,
            location: update.location,
            occurredAt: update.occurredAt,
            status: mapShiprocketStatus(update.statusId, update.statusLabel),
          },
        ]
  ).filter((e) => e.label);

  const latest = mapShiprocketStatus(update.statusId, update.statusLabel);

  const outcome = await db.$transaction(async (tx) => {
    const inserted = await tx.shipmentEvent.createMany({
      data: events.map((e) => ({
        shipmentId: shipment.id,
        status: e.status ?? shipment.status,
        label: e.label.slice(0, 120),
        location: e.location?.slice(0, 120) ?? null,
        occurredAt: e.occurredAt,
      })),
      skipDuplicates: true,
    });

    let moved = false;
    if (latest && RANK[latest] > RANK[shipment.status]) {
      const res = await tx.shipment.updateMany({
        where: { id: shipment.id, status: shipment.status }, // don't overwrite a newer concurrent update
        data: { status: latest, rawPayload: update.raw },
      });
      moved = res.count > 0;
    }

    let orderEvent: "shipped" | "delivered" | "rto" | null = null;
    if (latest && ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(latest)) {
      const moved = await tx.order.updateMany({
        where: { id: shipment.orderId, status: { in: READY_TO_SHIP_STATUSES } },
        data: { status: "SHIPPED" },
      });
      if (moved.count > 0) orderEvent = "shipped";
    }
    if (latest === "DELIVERED") {
      const done = await tx.order.updateMany({
        where: { id: shipment.orderId, status: { in: [...READY_TO_SHIP_STATUSES, "SHIPPED"] } },
        data: { status: "DELIVERED", deliveredAt: update.occurredAt },
      });
      if (done.count > 0) orderEvent = "delivered";
    }
    if (latest === "RTO") {
      logger.warn("shipment.rto", { orderId: shipment.orderId, awb: update.awb });
      // COD parcel refused / undeliverable: close the order, put the pieces back, and count the
      // refusal against the customer. The status switch is conditional, so a repeated webhook
      // can never restock or count twice. (Prepaid RTOs are handled by the admin: refund/reship.)
      const closed = await tx.order.updateMany({
        where: {
          id: shipment.orderId,
          paymentMethod: "COD",
          status: { in: [...READY_TO_SHIP_STATUSES, "SHIPPED"] },
        },
        data: {
          status: "CANCELLED",
          rtoAt: update.occurredAt,
          cancellationReason:
            "Cash on delivery parcel returned to the store (refused or undeliverable)",
        },
      });
      if (closed.count > 0) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: shipment.orderId },
          select: {
            userId: true,
            items: { select: { id: true, productId: true, variantId: true, quantity: true } },
          },
        });
        await restockLines(tx, order.items);
        for (const item of order.items)
          await tx.orderItem.update({
            where: { id: item.id },
            data: { returnedQuantity: item.quantity },
          });
        await tx.user.update({
          where: { id: order.userId },
          data: { codRefusals: { increment: 1 } },
        });
        orderEvent = "rto";
      }
    }

    return {
      result: inserted.count > 0 || moved ? ("applied" as const) : ("no_change" as const),
      orderEvent,
    };
  });
  if (outcome.orderEvent === "rto") {
    logger.warn("order.cod_rto_restocked", { orderId: shipment.orderId });
    const { revalidateTag } = await import("next/cache");
    const { CATALOG_TAG } = await import("@/services/catalog.service");
    revalidateTag(CATALOG_TAG);
  } else if (outcome.orderEvent) {
    const { notifyOrder } = await import("@/services/notification.service");
    await notifyOrder(shipment.orderId, outcome.orderEvent);
  }
  return outcome.result;
}

export async function getShipmentForOrder(orderId: string) {
  return db.shipment.findUnique({
    where: { orderId },
    include: { events: { orderBy: { occurredAt: "desc" } } },
  });
}

export type PincodeCheck =
  | { status: "serviceable"; etdDays: number | null }
  | { status: "not_serviceable" }
  | { status: "unknown" };

const cachedServiceability = unstable_cache(
  async (pincode: string) => checkServiceability(pincode),
  ["shiprocket:serviceability"],
  { revalidate: 6 * 60 * 60, tags: ["serviceability"] },
);

const cachedCodServiceability = unstable_cache(
  async (pincode: string) => checkServiceability(pincode, 0.5, true),
  ["shiprocket:serviceability:cod"],
  { revalidate: 6 * 60 * 60, tags: ["serviceability"] },
);

/**
 * Can a courier collect cash at this pincode? null = unknown (Shiprocket not set up or down);
 * the COD rules then rely on config.ini [cod] pincodes only.
 */
export async function checkCodPincode(pincode: string): Promise<boolean | null> {
  if (!isShiprocketConfigured) return null;
  try {
    return (await cachedCodServiceability(pincode)).serviceable;
  } catch (error) {
    logger.warn("shipment.cod_serviceability_failed", { error });
    return null;
  }
}

/** Pincode check with a 6-hour cache. "unknown" when Shiprocket isn't set up or is down (never blocks a sale). */
export async function checkPincode(pincode: string): Promise<PincodeCheck> {
  if (!isShiprocketConfigured) return { status: "unknown" };
  try {
    const result = await cachedServiceability(pincode);
    return result.serviceable
      ? { status: "serviceable", etdDays: result.etdDays }
      : { status: "not_serviceable" };
  } catch (error) {
    logger.warn("shipment.serviceability_failed", {
      error,
      pickup: env.SHIPROCKET_PICKUP_PINCODE,
    });
    return { status: "unknown" };
  }
}
