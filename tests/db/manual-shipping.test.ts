import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Manual delivery tracking (no courier service connected) against a real database: the owner's
 * details mark the order shipped, updates build the customer's timeline, "Delivered" completes
 * the order, and Shiprocket shipments are never overwritten.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const { db } = await import("@/lib/db");
const manual = await import("@/services/manual-shipping.service");

const RUN = `ms${Date.now().toString(36)}`;
let userId = "";
let adminId = "";

async function paidOrder(status: "PAID" | "CONFIRMED" | "PENDING" = "PAID") {
  return db.order.create({
    data: {
      userId,
      status,
      paidAt: status === "PAID" ? new Date() : null,
      subtotalInPaise: 1,
      totalInPaise: 1,
      addressSnapshot: {},
    },
  });
}

beforeAll(async () => {
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
  adminId = (await db.user.create({ data: { email: `${RUN}-admin@example.com`, role: "ADMIN" } }))
    .id;
});
afterAll(async () => {
  const orders = await db.order.findMany({ where: { userId }, select: { id: true } });
  await db.shipment.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await db.order.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
  await db.$disconnect();
});

describe("manual delivery tracking", () => {
  it("tracking details mark the order shipped; updates build the timeline; Delivered completes it", async () => {
    const o = await paidOrder();
    await manual.saveManualTracking(
      o.id,
      { courier: "Blue Dart", awb: `${RUN}-1`, trackingUrl: "https://bluedart.example/track" },
      adminId,
    );
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("SHIPPED");
    await manual.addManualUpdate(o.id, { status: "IN_TRANSIT", location: "Mumbai" }, adminId);
    await manual.addManualUpdate(o.id, { status: "OUT_FOR_DELIVERY" }, adminId);
    await manual.addManualUpdate(
      o.id,
      { status: "DELIVERED", note: "Handed to the customer" },
      adminId,
    );

    const shipment = await db.shipment.findUniqueOrThrow({
      where: { orderId: o.id },
      include: { events: { orderBy: { occurredAt: "asc" } } },
    });
    expect(shipment).toMatchObject({
      provider: "MANUAL",
      courier: "Blue Dart",
      status: "DELIVERED",
    });
    expect(shipment.events.map((e) => e.label)).toEqual([
      "Handed to Blue Dart",
      "In transit",
      "Out for delivery",
      "Handed to the customer",
    ]);
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("DELIVERED");
    await expect(manual.addManualUpdate(o.id, { status: "IN_TRANSIT" }, adminId)).rejects.toThrow(
      /already delivered/,
    );
  });

  it("correcting the details doesn't add a second 'handed to' event; no tracking number is fine", async () => {
    const o = await paidOrder("CONFIRMED");
    await manual.saveManualTracking(o.id, { courier: "Local courier" }, adminId);
    await manual.saveManualTracking(o.id, { courier: "DTDC", awb: `${RUN}-2` }, adminId);
    const s = await db.shipment.findUniqueOrThrow({
      where: { orderId: o.id },
      include: { events: true },
    });
    expect(s).toMatchObject({ courier: "DTDC", awb: `${RUN}-2` });
    expect(s.events).toHaveLength(1);
  });

  it("refuses unpaid orders, Shiprocket shipments, updates before details, and duplicate tracking numbers", async () => {
    const unpaid = await paidOrder("PENDING");
    await expect(manual.saveManualTracking(unpaid.id, { courier: "X" }, adminId)).rejects.toThrow(
      /paid/,
    );

    const shiprocket = await paidOrder();
    await db.shipment.create({
      data: { orderId: shiprocket.id, provider: "SHIPROCKET", awb: `${RUN}-SR` },
    });
    await expect(
      manual.saveManualTracking(shiprocket.id, { courier: "X" }, adminId),
    ).rejects.toThrow(/Shiprocket/);
    await expect(
      manual.addManualUpdate(shiprocket.id, { status: "IN_TRANSIT" }, adminId),
    ).rejects.toThrow(/Shiprocket/);

    const fresh = await paidOrder();
    await expect(
      manual.addManualUpdate(fresh.id, { status: "IN_TRANSIT" }, adminId),
    ).rejects.toThrow(/tracking details first/);
    await expect(
      manual.saveManualTracking(fresh.id, { courier: "Blue Dart", awb: `${RUN}-1` }, adminId),
    ).rejects.toThrow(/already used/);
  });
});
