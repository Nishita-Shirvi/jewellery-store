import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { createInvoiceForOrder } = await import("@/services/invoice.service");

const RUN = `inv${Date.now().toString(36)}`;
let userId = "";
let productId = "";
let categoryId = "";

async function paidOrder(state: string, priceInPaise = 195_000, shipping = 9_900) {
  return db.order.create({
    data: {
      userId,
      status: "PAID",
      paidAt: new Date(),
      subtotalInPaise: priceInPaise,
      shippingInPaise: shipping,
      totalInPaise: priceInPaise + shipping,
      addressSnapshot: {
        fullName: "Test Buyer",
        phone: "9876543210",
        line1: "1 Road",
        city: "City",
        state,
        pincode: "500001",
        country: "IN",
      },
      items: {
        create: {
          productId,
          productName: "Evil Eye Pendant",
          productSlug: "x",
          priceInPaise,
          quantity: 1,
          lineTotalInPaise: priceInPaise,
          productSnapshot: {},
          hsnCode: "7113",
          gstRateBps: 300,
        },
      },
    },
  });
}

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
  productId = (
    await db.product.create({
      data: {
        name: RUN,
        slug: RUN,
        description: "x",
        priceInPaise: 195_000,
        stock: 5,
        images: ["/x.svg"],
        categoryId,
        metalType: "SILVER",
        purity: "S925",
        metalColour: "SILVER",
        netWeightMg: 4000,
      },
    })
  ).id;
});

afterAll(async () => {
  await db.invoice.deleteMany({ where: { order: { userId } } });
  await db.order.deleteMany({ where: { userId } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("tax invoices (real database)", () => {
  it("25 orders paid at the same moment get 25 consecutive numbers — no gaps, no duplicates", async () => {
    const before = (await db.invoiceCounter.findMany()).reduce(
      (m, c) => Math.max(m, c.lastNumber),
      0,
    );
    const orders = await Promise.all(Array.from({ length: 25 }, () => paidOrder("Telangana")));
    const results = await Promise.all(orders.map((o) => createInvoiceForOrder(o.id)));
    const seqs = results.map((r) => Number(r!.number.split("/").pop())).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(25);
    expect(seqs[24]! - seqs[0]!).toBe(24); // consecutive
    expect(seqs[0]).toBeGreaterThan(before);
  });

  it("creating the invoice twice (or in parallel) for one order gives one invoice", async () => {
    const o = await paidOrder("Telangana");
    const [a, b, c] = await Promise.all([
      createInvoiceForOrder(o.id),
      createInvoiceForOrder(o.id),
      createInvoiceForOrder(o.id),
    ]);
    expect(a!.number).toBe(b!.number);
    expect(b!.number).toBe(c!.number);
    expect(await db.invoice.count({ where: { orderId: o.id } })).toBe(1);
  });

  it("same state → CGST + SGST; tax lines add up exactly to the order total", async () => {
    const o = await paidOrder("Telangana");
    await createInvoiceForOrder(o.id);
    const snap = (await db.invoice.findUniqueOrThrow({ where: { orderId: o.id } })).snapshot as {
      intraState: boolean;
      totals: {
        taxableInPaise: number;
        cgstInPaise: number;
        sgstInPaise: number;
        igstInPaise: number;
        totalInPaise: number;
      };
    };
    expect(snap.intraState).toBe(true);
    expect(snap.totals.igstInPaise).toBe(0);
    expect(snap.totals.taxableInPaise + snap.totals.cgstInPaise + snap.totals.sgstInPaise).toBe(
      snap.totals.totalInPaise,
    );
    expect(snap.totals.totalInPaise).toBe(204_900);
  });

  it("other state → IGST only", async () => {
    const o = await paidOrder("Karnataka");
    await createInvoiceForOrder(o.id);
    const snap = (await db.invoice.findUniqueOrThrow({ where: { orderId: o.id } })).snapshot as {
      intraState: boolean;
      totals: {
        taxableInPaise: number;
        cgstInPaise: number;
        sgstInPaise: number;
        igstInPaise: number;
        totalInPaise: number;
      };
      placeOfSupply: string;
    };
    expect(snap).toMatchObject({ intraState: false, placeOfSupply: "Karnataka" });
    expect(snap.totals.cgstInPaise + snap.totals.sgstInPaise).toBe(0);
    expect(snap.totals.taxableInPaise + snap.totals.igstInPaise).toBe(204_900);
  });

  it("unpaid orders don't get an invoice", async () => {
    const o = await db.order.create({
      data: {
        userId,
        status: "PENDING",
        subtotalInPaise: 100,
        totalInPaise: 100,
        addressSnapshot: {},
      },
    });
    expect(await createInvoiceForOrder(o.id)).toBeNull();
  });
});
