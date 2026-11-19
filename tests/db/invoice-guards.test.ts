import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const business = vi.hoisted(() => ({ incomplete: false }));
vi.mock("@/lib/business", () => ({
  getBusiness: () => ({
    legalName: "Test Jewellers Pvt Ltd",
    address: "1 Test Road, Hyderabad, Telangana 500001",
    email: "billing@test-jewellers.in",
    phone: "+91 90000 00000",
    gstin: "36AAAAA0000A1Z5",
    state: "Telangana",
    incomplete: business.incomplete,
  }),
}));

const { db } = await import("@/lib/db");
const { createInvoiceForOrder } = await import("@/services/invoice.service");

const RUN = `ig${Date.now().toString(36)}`;
let userId = "";
let productId = "";
let variantId = "";
let categoryId = "";

/** A paid order whose tax split was stored at checkout (here: IGST, i.e. inter-state). */
async function paidOrder(buyerState: string) {
  return db.order.create({
    data: {
      userId,
      status: "PAID",
      paidAt: new Date(),
      subtotalInPaise: 103_000,
      totalInPaise: 103_000,
      addressSnapshot: {
        fullName: "Test Buyer",
        phone: "9876543210",
        line1: "1 Road",
        city: "City",
        state: buyerState,
        pincode: "500001",
      },
      items: {
        create: {
          productId,
          variantId,
          productName: "Ring",
          productSlug: "x",
          priceInPaise: 103_000,
          quantity: 1,
          lineTotalInPaise: 103_000,
          productSnapshot: {},
          hsnCode: "7113",
          gstRateBps: 300,
          taxableValueInPaise: 100_000,
          igstInPaise: 3_000,
        },
      },
    },
  });
}

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
  const product = await db.product.create({
    data: {
      name: RUN,
      slug: RUN,
      description: "x",
      priceInPaise: 103_000,
      stock: 5,
      images: ["/x.svg"],
      categoryId,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 4000,
      variants: {
        create: {
          sku: RUN.toUpperCase(),
          priceInPaise: 103_000,
          stock: 5,
          netWeightMg: 4000,
          images: [],
        },
      },
    },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0]!.id;
});

afterAll(async () => {
  await db.invoice.deleteMany({ where: { order: { userId } } });
  await db.order.deleteMany({ where: { userId } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("invoice guards (real database)", () => {
  it("no invoice (and no number used up) while business details are placeholders", async () => {
    business.incomplete = true;
    try {
      const counters = await db.invoiceCounter.findMany();
      const o = await paidOrder("Karnataka");
      expect(await createInvoiceForOrder(o.id)).toBeNull();
      expect(await db.invoice.count({ where: { orderId: o.id } })).toBe(0);
      expect(await db.invoiceCounter.findMany()).toEqual(counters);
    } finally {
      business.incomplete = false;
    }
  });

  it("intra/inter-state comes from the stored tax split, not today's seller state", async () => {
    // Buyer in the seller's (current) state, but the order was taxed as IGST at checkout.
    const o = await paidOrder("Telangana");
    expect(await createInvoiceForOrder(o.id)).not.toBeNull();
    const snap = (await db.invoice.findUniqueOrThrow({ where: { orderId: o.id } })).snapshot as {
      intraState: boolean;
      totals: { igstInPaise: number; cgstInPaise: number };
    };
    expect(snap.intraState).toBe(false);
    expect(snap.totals).toMatchObject({ igstInPaise: 3_000, cgstInPaise: 0 });
  });
});
