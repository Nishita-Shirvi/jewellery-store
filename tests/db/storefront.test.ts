import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

const { db } = await import("@/lib/db");
const { saveRates, priceForSave, RateError } = await import("@/services/metal-rate.service");
const { updateProduct, deleteProduct, AdminInputError } =
  await import("@/services/admin/product-admin.service");
const { createVisitRequest, checkVisitDate, VisitError } = await import("@/services/visit.service");
const { productFormSchema } = await import("@/lib/validation/admin");

const RUN = `sf${Date.now().toString(36)}`;
const startedAt = new Date();
let adminId = "";
let categoryId = "";
const productIds: string[] = [];

async function product(data: Partial<Parameters<typeof db.product.create>[0]["data"]> = {}) {
  const p = await db.product.create({
    data: {
      name: `${RUN} piece ${productIds.length}`,
      slug: `${RUN}-piece-${productIds.length}`,
      description: "A test piece for the storefront tests.",
      priceInPaise: 10_000_00,
      stock: 5,
      images: ["/images/products/classic-solitaire-ring.svg"],
      metalType: "PLATINUM",
      purity: "PT950",
      metalColour: "WHITE",
      netWeightMg: 2000,
      categoryId,
      ...data,
    } as Parameters<typeof db.product.create>[0]["data"],
  });
  productIds.push(p.id);
  return p;
}

function form(p: { id: string; name: string }, overrides: Record<string, string> = {}) {
  return productFormSchema.parse({
    name: p.name,
    description: "A test piece for the storefront tests.",
    categoryId,
    price: "10000",
    makingCharge: "",
    grossWeight: "",
    stock: "5",
    metalType: "PLATINUM",
    purity: "PT950",
    metalColour: "WHITE",
    netWeight: "2",
    images: "/images/products/classic-solitaire-ring.svg",
    isActive: "on",
    ...overrides,
  });
}

beforeAll(async () => {
  adminId = (await db.user.create({ data: { email: `${RUN}@example.com`, role: "ADMIN" } })).id;
  categoryId = (await db.category.create({ data: { name: `${RUN} cat`, slug: `${RUN}-cat` } })).id;
});

afterAll(async () => {
  await db.visitRequest.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.metalRate.deleteMany({ where: { createdAt: { gte: startedAt }, setById: adminId } });
  await db.user.deleteMany({ where: { id: adminId } });
  await db.$disconnect();
});

describe("metal rates", () => {
  it("saves a rate and reprices only rate-linked pieces of that purity", async () => {
    const linked = await product({ pricingMode: "RATE_LINKED", makingChargeInPaise: 1_000_00 });
    const fixed = await product();
    const result = await saveRates(adminId, { PT950: 3_000_00 }, true);
    expect(result.saved).toEqual(["PT950"]);
    // 2 g × ₹3,000 + ₹1,000 making = ₹7,000; × 1.03 = ₹7,210
    expect((await db.product.findUniqueOrThrow({ where: { id: linked.id } })).priceInPaise).toBe(
      7_210_00,
    );
    expect((await db.product.findUniqueOrThrow({ where: { id: fixed.id } })).priceInPaise).toBe(
      10_000_00,
    );
  });

  it("refuses a >15% jump unless confirmed (the per-10-gram typo)", async () => {
    await expect(saveRates(adminId, { PT950: 30_000_00 }, false)).rejects.toBeInstanceOf(RateError);
    const latest = await db.metalRate.findFirstOrThrow({
      where: { purity: "PT950" },
      orderBy: { createdAt: "desc" },
    });
    expect(latest.ratePerGramInPaise).toBe(3_000_00);
  });

  it("calculates the price on save for rate-linked products", async () => {
    const price = await priceForSave({
      pricingMode: "RATE_LINKED",
      typedPriceInPaise: null,
      purity: "PT950",
      netWeightMg: 1000,
      makingChargeInPaise: 0,
      stoneChargeInPaise: 0,
      gstRateBps: 300,
    });
    expect(price).toBe(3_090_00);
  });
});

describe("product edits", () => {
  it("doesn't undo a sale that happened while the admin was editing", async () => {
    const p = await product({ stock: 3, pricingMode: "FIXED" });
    // A customer buys one after the form was opened with stock 3.
    await db.product.update({ where: { id: p.id }, data: { stock: 2 } });
    // Admin changes only the name: stock must stay 2.
    await updateProduct(
      p.id,
      form(p, { name: `${p.name} renamed`, stock: "3", stockOriginal: "3" }),
      adminId,
    );
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(2);
    // Admin changes stock based on the stale 3: refused instead of overwriting.
    await expect(
      updateProduct(p.id, form(p, { stock: "10", stockOriginal: "3" }), adminId),
    ).rejects.toBeInstanceOf(AdminInputError);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(2);
  });

  it("keeps the old slug so links redirect", async () => {
    const p = await product();
    await updateProduct(p.id, form(p, { slug: `${RUN}-new-name` }), adminId);
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.slug).toBe(`${RUN}-new-name`);
    expect(after.previousSlugs).toContain(p.slug);
  });

  it("deletes a never-ordered product but refuses one with orders", async () => {
    const p = await product();
    await deleteProduct(p.id, adminId);
    expect(await db.product.findUnique({ where: { id: p.id } })).toBeNull();

    const ordered = await product();
    const order = await db.order.create({
      data: {
        userId: adminId,
        status: "PENDING",
        subtotalInPaise: 100,
        totalInPaise: 100,
        addressSnapshot: {},
        items: {
          create: {
            productId: ordered.id,
            productName: ordered.name,
            productSlug: ordered.slug,
            priceInPaise: 100,
            quantity: 1,
            lineTotalInPaise: 100,
            productSnapshot: {},
          },
        },
      },
    });
    await expect(deleteProduct(ordered.id, adminId)).rejects.toBeInstanceOf(AdminInputError);
    await db.order.delete({ where: { id: order.id } });
  });
});

describe("visit requests", () => {
  it("validates the date window", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(() => checkVisitDate("2026-11-17", now)).toThrow(VisitError);
    expect(checkVisitDate("2026-11-18", now).toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(() => checkVisitDate("2027-03-01", now)).toThrow(VisitError);
    expect(() => checkVisitDate("2026-02-30", now)).toThrow(VisitError);
  });

  it("saves a request linked to the product", async () => {
    const p = await product();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const visit = await createVisitRequest({
      name: `${RUN} Asha`,
      phone: "9876543210",
      email: null,
      preferredDate: tomorrow,
      timeSlot: "Morning (10 am – 1 pm)",
      message: null,
      productSlug: p.slug,
      userId: null,
    });
    const saved = await db.visitRequest.findUniqueOrThrow({ where: { id: visit.id } });
    expect(saved.productId).toBe(p.id);
    expect(saved.status).toBe("NEW");
  });
});
