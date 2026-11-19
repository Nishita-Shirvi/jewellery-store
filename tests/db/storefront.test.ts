import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

const { db } = await import("@/lib/db");
const inventory = await import("@/services/inventory.service");
const {
  saveRates,
  rateLinkedStartPrice,
  RateError,
  repriceAllRateLinked,
  productsNeedingReprice,
  ratesAreStale,
} = await import("@/services/metal-rate.service");
const { updateProduct, deleteProduct, setProductStock, AdminInputError } =
  await import("@/services/admin/product-admin.service");
const variantAdmin = await import("@/services/admin/variant-admin.service");
const { createVisitRequest, checkVisitDate, VisitError } = await import("@/services/visit.service");
const { productFormSchema } = await import("@/lib/validation/admin");

const RUN = `sf${Date.now().toString(36)}`;
const startedAt = new Date();
let adminId = "";
let categoryId = "";
let seq = 0;
const productIds: string[] = [];

/** A product with one base variant (no options), like every product created in admin. */
async function product(
  data: Partial<Parameters<typeof db.product.create>[0]["data"]> & {
    stock?: number;
    priceInPaise?: number;
  } = {},
) {
  const n = ++seq;
  const price = data.priceInPaise ?? 10_000_00;
  const stock = data.stock ?? 5;
  const p = await db.product.create({
    data: {
      name: `${RUN} piece ${n}`,
      slug: `${RUN}-piece-${n}`,
      description: "A test piece for the storefront tests.",
      images: ["/images/products/classic-solitaire-ring.svg"],
      metalType: "PLATINUM",
      purity: "PT950",
      metalColour: "WHITE",
      netWeightMg: 2000,
      categoryId,
      ...data,
      priceInPaise: price,
      stock,
      variants: {
        create: {
          sku: `${RUN}-P${n}`.toUpperCase(),
          priceInPaise: price,
          stock,
          netWeightMg: 2000,
          images: [],
        },
      },
    } as Parameters<typeof db.product.create>[0]["data"],
    include: { variants: true },
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

const variantsOf = (productId: string) =>
  db.productVariant.findMany({ where: { productId }, orderBy: { position: "asc" } });

beforeAll(async () => {
  adminId = (await db.user.create({ data: { email: `${RUN}@example.com`, role: "ADMIN" } })).id;
  categoryId = (await db.category.create({ data: { name: `${RUN} cat`, slug: `${RUN}-cat` } })).id;
});

afterAll(async () => {
  await db.visitRequest.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.orderItem.deleteMany({ where: { productId: { in: productIds } } });
  await db.order.deleteMany({ where: { userId: adminId } });
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
    // 2 g × ₹3,000 + ₹1,000 making = ₹7,000; × 1.03 = ₹7,210 — on the variant and the summary.
    expect((await variantsOf(linked.id))[0]!.priceInPaise).toBe(7_210_00);
    expect((await db.product.findUniqueOrThrow({ where: { id: linked.id } })).priceInPaise).toBe(
      7_210_00,
    );
    expect((await variantsOf(fixed.id))[0]!.priceInPaise).toBe(10_000_00);
  });

  it("prices every size by its own weight, and clears a 'was' price that is no longer higher", async () => {
    const p = await product({ pricingMode: "RATE_LINKED" });
    await variantAdmin.saveOptions(p.id, [{ name: "Ring size", values: ["10", "12"] }], adminId);
    const [small, big] = (await variantsOf(p.id)).filter((v) => v.optionKey !== "");
    await db.productVariant.update({
      where: { id: small!.id },
      data: { netWeightMg: 1000, compareAtPriceInPaise: 3_100_00 },
    });
    await db.productVariant.update({ where: { id: big!.id }, data: { netWeightMg: 3000 } });
    await saveRates(adminId, { PT950: 3_100_00 }, true);
    const after = new Map((await variantsOf(p.id)).map((v) => [v.id, v]));
    // 1 g × ₹3,100 × 1.03 = ₹3,193; 3 g → ₹9,579
    expect(after.get(small!.id)!.priceInPaise).toBe(3_193_00);
    expect(after.get(small!.id)!.compareAtPriceInPaise).toBeNull();
    expect(after.get(big!.id)!.priceInPaise).toBe(9_579_00);
    // The product's "from" price is the cheapest active size.
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).priceInPaise).toBe(
      3_193_00,
    );
  });

  it("refuses a >15% jump unless confirmed (the per-10-gram typo)", async () => {
    await expect(saveRates(adminId, { PT950: 31_000_00 }, false)).rejects.toBeInstanceOf(RateError);
    const latest = await db.metalRate.findFirstOrThrow({
      where: { purity: "PT950" },
      orderBy: { createdAt: "desc" },
    });
    expect(latest.ratePerGramInPaise).toBe(3_100_00);
  });

  it("reprices hundreds of sizes one product at a time; a half-finished run is caught up by Reprice now", async () => {
    // 100 rate-linked K14 products × 3 sizes = 300 variants (well past one 5 s transaction).
    const made: string[] = [];
    for (let i = 0; i < 100; i++) {
      const n = ++seq;
      const p = await db.product.create({
        data: {
          name: `${RUN} bulk ${n}`,
          slug: `${RUN}-bulk-${n}`,
          description: "Bulk rate-linked piece.",
          images: ["/images/products/classic-solitaire-ring.svg"],
          metalType: "GOLD",
          purity: "K14",
          metalColour: "YELLOW",
          netWeightMg: 1000,
          pricingMode: "RATE_LINKED",
          priceInPaise: 1_00,
          stock: 3,
          categoryId,
          variants: {
            create: [0, 1, 2].map((k) => ({
              sku: `${RUN}-B${n}-${k}`.toUpperCase(),
              optionKey: `k${k}`,
              priceInPaise: 1_00,
              stock: 1,
              netWeightMg: 1000 * (k + 1),
              images: [],
              position: k,
            })),
          },
        },
      });
      made.push(p.id);
      productIds.push(p.id);
    }
    const result = await saveRates(adminId, { K14: 4_000_00 }, true);
    expect(result.failed).toBe(0);
    expect(result.repriced).toBe(300);
    const prices = await db.productVariant.findMany({
      where: { productId: { in: made } },
      select: { priceInPaise: true, netWeightMg: true },
    });
    // 1 g × ₹4,000 × 1.03 = ₹4,120; 2 g = ₹8,240; 3 g = ₹12,360
    for (const v of prices) expect(v.priceInPaise).toBe((v.netWeightMg / 1000) * 4_120_00);
    expect(await productsNeedingReprice()).toBe(0);

    // A repricing that stopped half-way: two products still carry the old price.
    await db.productVariant.updateMany({
      where: { productId: { in: made.slice(0, 2) } },
      data: { priceInPaise: 1_00 },
    });
    expect(await productsNeedingReprice()).toBe(2);
    const again = await repriceAllRateLinked();
    expect(again).toEqual({ repriced: 6, failed: 0 });
    expect(await productsNeedingReprice()).toBe(0);
  }, 120_000);

  it("warns about a stale rate for a purity used only by one size", async () => {
    // Every purity the bulk/other tests use has a fresh rate…
    expect(await ratesAreStale()).toBe(false);
    // …but an 18K size of a rate-linked piece has no K18 rate at all.
    const p = await product({ pricingMode: "RATE_LINKED" });
    await db.productVariant.update({ where: { id: p.variants[0]!.id }, data: { purity: "K18" } });
    expect(await ratesAreStale()).toBe(true);
    await db.productVariant.update({ where: { id: p.variants[0]!.id }, data: { purity: null } });
  });

  it("works out the starting price for a new rate-linked product", async () => {
    const price = await rateLinkedStartPrice({
      purity: "PT950",
      netWeightMg: 1000,
      makingChargeInPaise: 0,
      stoneChargeInPaise: 0,
      gstRateBps: 300,
    });
    expect(price).toBe(3_193_00);
  });
});

describe("product edits", () => {
  it("doesn't undo a sale that happened while the admin was editing", async () => {
    const p = await product({ stock: 3 });
    const base = p.variants[0]!;
    // A customer buys one after the form was opened with stock 3.
    await db.productVariant.update({ where: { id: base.id }, data: { stock: 2 } });
    await db.$transaction((tx) => inventory.syncProductSummaries(tx, [p.id]));
    // Admin changes only the name: stock must stay 2.
    await updateProduct(
      p.id,
      form(p, { name: `${p.name} renamed`, stock: "3", stockOriginal: "3" }),
      adminId,
    );
    expect((await variantsOf(p.id))[0]!.stock).toBe(2);
    // Admin changes stock based on the stale 3: refused instead of overwriting.
    await expect(
      updateProduct(p.id, form(p, { stock: "10", stockOriginal: "3" }), adminId),
    ).rejects.toBeInstanceOf(AdminInputError);
    expect((await variantsOf(p.id))[0]!.stock).toBe(2);
    // The quick stock edit in the list behaves the same way.
    await expect(setProductStock(p.id, 9, adminId, 3)).rejects.toBeInstanceOf(AdminInputError);
    await setProductStock(p.id, 9, adminId, 2);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(9);
  });

  it("keeps the old slug so links redirect", async () => {
    const p = await product();
    await updateProduct(p.id, form(p, { slug: `${RUN}-new-name` }), adminId);
    const after = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.slug).toBe(`${RUN}-new-name`);
    expect(after.previousSlugs).toContain(p.slug);
  });

  it("switching to rate-linked reprices from today's rate", async () => {
    const p = await product();
    await updateProduct(p.id, form(p, { pricingMode: "RATE_LINKED", price: "" }), adminId);
    // 2 g × ₹3,100 × 1.03 = ₹6,386
    expect((await variantsOf(p.id))[0]!.priceInPaise).toBe(6_386_00);
  });

  it("deletes a never-ordered product but refuses one with orders", async () => {
    const p = await product();
    await deleteProduct(p.id, adminId);
    expect(await db.product.findUnique({ where: { id: p.id } })).toBeNull();

    const ordered = await product();
    await db.order.create({
      data: {
        userId: adminId,
        status: "PENDING",
        subtotalInPaise: 100,
        totalInPaise: 100,
        addressSnapshot: {},
        items: {
          create: {
            productId: ordered.id,
            variantId: ordered.variants[0]!.id,
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
