import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 17 — product variants against a real PostgreSQL database.
 * Focus: the things most likely to break — stock per variant under concurrency, deadlocks,
 * product summaries drifting from their variants, old/tampered cart cookies, admin edits racing
 * with checkouts, and SKU rules.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { db } = await import("@/lib/db");
const inventory = await import("@/services/inventory.service");
const cart = await import("@/services/cart.service");
const variantAdmin = await import("@/services/admin/variant-admin.service");
const productAdmin = await import("@/services/admin/product-admin.service");
const {
  InsufficientStockError,
  reserveLines,
  convertReservation,
  releaseReservation,
  restockLines,
} = inventory;

const RUN = `var${Date.now().toString(36)}`;
let categoryId = "";
let userId = "";
let seq = 0;

type V = { id: string; productId: string; sku: string };
const line = (v: V, quantity: number) => ({ productId: v.productId, variantId: v.id, quantity });

/** A product with the given variants (no options → one base variant with optionKey ""). */
async function product(variants: { stock: number; price?: number; label?: string }[]) {
  const n = ++seq;
  const p = await db.product.create({
    data: {
      name: `${RUN} piece ${n}`,
      slug: `${RUN}-p${n}`,
      description: "test",
      priceInPaise: 0,
      images: ["/x.svg"],
      categoryId,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 1000,
      variants: {
        create: variants.map((v, i) => ({
          sku: `${RUN}-P${n}-V${i}`.toUpperCase(),
          optionKey: variants.length === 1 ? "" : `k${i}`,
          label: v.label ?? (variants.length === 1 ? "" : `Size ${i}`),
          priceInPaise: v.price ?? 100_00,
          stock: v.stock,
          netWeightMg: 1000 + i,
          images: [],
          position: i,
        })),
      },
    },
    include: { variants: { orderBy: { position: "asc" } } },
  });
  await db.$transaction((tx) => inventory.syncProductSummaries(tx, [p.id]));
  return { id: p.id, slug: p.slug, variants: p.variants as V[] };
}

const variantStock = (id: string) =>
  db.productVariant.findUniqueOrThrow({
    where: { id },
    select: { stock: true, reservedStock: true },
  });
const productSummary = (id: string) =>
  db.product.findUniqueOrThrow({
    where: { id },
    select: { stock: true, reservedStock: true, priceInPaise: true },
  });

/** The product summary must always equal what its active variants add up to. */
async function expectSummaryConsistent(productId: string) {
  const vs = await db.productVariant.findMany({ where: { productId, isActive: true } });
  const p = await productSummary(productId);
  expect(p.stock).toBe(vs.reduce((s, v) => s + v.stock, 0));
  expect(p.reservedStock).toBe(vs.reduce((s, v) => s + Math.min(v.reservedStock, v.stock), 0));
  if (vs.length) expect(p.priceInPaise).toBe(Math.min(...vs.map((v) => v.priceInPaise)));
}

async function order(lines: { productId: string; variantId: string; quantity: number }[]) {
  return db.order.create({
    data: {
      userId,
      status: "PENDING",
      subtotalInPaise: 100_00,
      totalInPaise: 100_00,
      addressSnapshot: {},
      reservationState: "ACTIVE",
      reservedUntil: new Date(Date.now() + 60_000),
      items: {
        create: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          productName: "x",
          productSlug: "x",
          priceInPaise: 100_00,
          quantity: l.quantity,
          lineTotalInPaise: 100_00 * l.quantity,
          productSnapshot: {},
        })),
      },
    },
  });
}

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
});

afterAll(async () => {
  await db.cartItem.deleteMany({ where: { cart: { userId } } });
  await db.cart.deleteMany({ where: { userId } });
  await db.order.deleteMany({ where: { userId } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

beforeEach(() => jar.clear());

// ───────────────────────── stock per variant ─────────────────────────

describe("stock is tracked per variant", () => {
  it("two buyers race for the last size 12 → one wins; size 14 is unaffected", async () => {
    const p = await product([{ stock: 1 }, { stock: 1 }]);
    const [s12, s14] = p.variants as [V, V];
    const attempt = () => db.$transaction((tx) => reserveLines(tx, [line(s12, 1)]));
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason,
    ).toBeInstanceOf(InsufficientStockError);
    expect(await variantStock(s12.id)).toEqual({ stock: 1, reservedStock: 1 });
    expect(await variantStock(s14.id)).toEqual({ stock: 1, reservedStock: 0 });
    // size 14 can still be bought
    await db.$transaction((tx) => reserveLines(tx, [line(s14, 1)]));
    expect(await productSummary(p.id)).toMatchObject({ stock: 2, reservedStock: 2 });
    await expectSummaryConsistent(p.id);
  });

  it("30 buyers in random order across 2 products × 2 variants: no deadlock, never oversold", async () => {
    const a = await product([{ stock: 4 }, { stock: 4 }]);
    const b = await product([{ stock: 4 }, { stock: 4 }]);
    const all = [...a.variants, ...b.variants];
    const shuffled = <T>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5);
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, () =>
        db.$transaction((tx) =>
          reserveLines(
            tx,
            shuffled(all)
              .slice(0, 3)
              .map((v) => line(v, 1)),
          ),
        ),
      ),
    );
    const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    // Every failure must be a clean "sold out", never a deadlock / serialization error.
    for (const f of failures) expect(f.reason).toBeInstanceOf(InsufficientStockError);
    for (const v of all) {
      const s = await variantStock(v.id);
      expect(s.reservedStock).toBeLessThanOrEqual(s.stock);
    }
    const held = (await Promise.all(all.map((v) => variantStock(v.id)))).reduce(
      (n, s) => n + s.reservedStock,
      0,
    );
    expect(held).toBe((results.length - failures.length) * 3);
    await expectSummaryConsistent(a.id);
    await expectSummaryConsistent(b.id);
  });

  it("a switched-off variant can't be reserved even with stock; nor can one of a hidden product", async () => {
    const p = await product([{ stock: 5 }, { stock: 5 }]);
    await db.productVariant.update({ where: { id: p.variants[0]!.id }, data: { isActive: false } });
    await expect(
      db.$transaction((tx) => reserveLines(tx, [line(p.variants[0]!, 1)])),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    await db.product.update({ where: { id: p.id }, data: { isActive: false } });
    await expect(
      db.$transaction((tx) => reserveLines(tx, [line(p.variants[1]!, 1)])),
    ).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("a variant can't be reserved under another product's id (tampered line)", async () => {
    const p = await product([{ stock: 5 }]);
    const q = await product([{ stock: 5 }]);
    await expect(
      db.$transaction((tx) =>
        reserveLines(tx, [{ productId: p.id, variantId: q.variants[0]!.id, quantity: 1 }]),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await variantStock(q.variants[0]!.id)).toEqual({ stock: 5, reservedStock: 0 });
  });

  it("pay, release and restock touch only the variant that was bought", async () => {
    const p = await product([{ stock: 3 }, { stock: 3 }]);
    const [v0, v1] = p.variants as [V, V];
    const paid = await order([line(v0, 2)]);
    await db.$transaction((tx) => reserveLines(tx, [line(v0, 2)]));
    await db.$transaction((tx) => convertReservation(tx, paid.id, "ACTIVE"));
    expect(await variantStock(v0.id)).toEqual({ stock: 1, reservedStock: 0 });
    expect(await variantStock(v1.id)).toEqual({ stock: 3, reservedStock: 0 });

    const abandoned = await order([line(v1, 1)]);
    await db.$transaction((tx) => reserveLines(tx, [line(v1, 1)]));
    expect(await db.$transaction((tx) => releaseReservation(tx, abandoned.id))).toBe(true);
    expect(await db.$transaction((tx) => releaseReservation(tx, abandoned.id))).toBe(false); // once
    expect(await variantStock(v1.id)).toEqual({ stock: 3, reservedStock: 0 });

    await db.$transaction((tx) => restockLines(tx, [line(v0, 2)])); // e.g. return approved
    expect(await variantStock(v0.id)).toEqual({ stock: 3, reservedStock: 0 });
    expect(await variantStock(v1.id)).toEqual({ stock: 3, reservedStock: 0 });
    await expectSummaryConsistent(p.id);
  });
});

// ───────────────────────── cart ─────────────────────────

describe("cart with variants", () => {
  it("a guest cookie from before Phase 17 (no variantId) still works", async () => {
    const p = await product([{ stock: 5, price: 2_200_00 }]);
    jar.set(cart.GUEST_CART_COOKIE, JSON.stringify([{ productId: p.id, quantity: 2 }]));
    const view = await cart.getCartView(null);
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({
      variantId: p.variants[0]!.id,
      quantity: 2,
      issue: null,
    });
    expect(view.subtotalInPaise).toBe(4_400_00);
  });

  it("an old cookie line for a product that now has options is dropped, not guessed", async () => {
    const p = await product([{ stock: 5 }, { stock: 5 }]); // no base ("") variant
    jar.set(cart.GUEST_CART_COOKIE, JSON.stringify([{ productId: p.id, quantity: 1 }]));
    expect((await cart.getCartView(null)).items).toHaveLength(0);
  });

  it("a tampered cookie (variant of another product) is dropped", async () => {
    const p = await product([{ stock: 5 }]);
    const q = await product([{ stock: 5, price: 1_00 }]);
    jar.set(
      cart.GUEST_CART_COOKIE,
      JSON.stringify([{ productId: p.id, variantId: q.variants[0]!.id, quantity: 1 }]),
    );
    expect((await cart.getCartView(null)).items).toHaveLength(0);
  });

  it("garbage cookies give an empty cart, not an error", async () => {
    for (const bad of [
      "not json",
      "{}",
      '[{"productId":"x"}]',
      '[{"productId":"a b","quantity":1}]',
    ]) {
      jar.set(cart.GUEST_CART_COOKIE, bad);
      expect((await cart.getCartView(null)).items).toEqual([]);
    }
  });

  it("a product with options needs a choice; a variant from another product is refused", async () => {
    const p = await product([{ stock: 5 }, { stock: 5 }]);
    const q = await product([{ stock: 5 }]);
    expect(await cart.addItem(userId, p.id, 1)).toEqual({
      ok: false,
      error: "Please choose an option first.",
    });
    expect(await cart.addItem(userId, p.id, 1, q.variants[0]!.id)).toMatchObject({ ok: false });
    expect((await cart.getCartView(userId)).items).toHaveLength(0);
  });

  it("two sizes of one ring are two lines, each limited by its own stock", async () => {
    const p = await product([
      { stock: 1, price: 100_00 },
      { stock: 5, price: 150_00 },
    ]);
    const [small, big] = p.variants as [V, V];
    expect(await cart.addItem(userId, p.id, 1, small.id)).toMatchObject({ ok: true });
    expect(await cart.addItem(userId, p.id, 1, small.id)).toMatchObject({ ok: false }); // only 1
    expect(await cart.addItem(userId, p.id, 3, big.id)).toMatchObject({ ok: true });
    const view = await cart.getCartView(userId);
    expect(view.items.map((i) => [i.variantId, i.quantity])).toEqual([
      [small.id, 1],
      [big.id, 3],
    ]);
    expect(view.subtotalInPaise).toBe(100_00 + 3 * 150_00);
    // change one line without touching the other
    expect(await cart.setItemQuantity(userId, big.id, 2)).toEqual({ ok: true });
    await cart.removeItem(userId, small.id);
    const after = await cart.getCartView(userId);
    expect(after.items.map((i) => [i.variantId, i.quantity])).toEqual([[big.id, 2]]);
    await cart.clearCart(userId);
  });

  it("changing quantity of a variant that isn't in the cart is refused", async () => {
    const p = await product([{ stock: 5 }]);
    expect(await cart.setItemQuantity(userId, p.variants[0]!.id, 3)).toMatchObject({ ok: false });
    expect((await cart.getCartView(userId)).items).toHaveLength(0);
  });

  it("switching a variant off flags it in carts that already hold it", async () => {
    const p = await product([{ stock: 5 }, { stock: 5 }]);
    await cart.addItem(userId, p.id, 1, p.variants[0]!.id);
    await db.productVariant.update({ where: { id: p.variants[0]!.id }, data: { isActive: false } });
    const view = await cart.getCartView(userId);
    expect(view.items[0]).toMatchObject({ issue: "unavailable", quantity: 0 });
    expect(view.hasIssues).toBe(true);
    await cart.clearCart(userId);
  });

  it("guest cart merges into the saved cart per variant after login", async () => {
    const p = await product([{ stock: 3 }, { stock: 3 }]);
    const [a, b] = p.variants as [V, V];
    await cart.addItem(userId, p.id, 2, a.id);
    jar.set(
      cart.GUEST_CART_COOKIE,
      JSON.stringify([
        { productId: p.id, variantId: a.id, quantity: 2 }, // 2 + 2 > 3 → capped at 3
        { productId: p.id, variantId: b.id, quantity: 1 },
      ]),
    );
    await cart.mergeGuestCartIntoUser(userId);
    const view = await cart.getCartView(userId);
    expect(view.items.map((i) => [i.variantId, i.quantity])).toEqual([
      [a.id, 3],
      [b.id, 1],
    ]);
    expect(jar.has(cart.GUEST_CART_COOKIE)).toBe(false);
    await cart.clearCart(userId);
  });
});

// ───────────────────────── admin ─────────────────────────

describe("admin: options, combinations, bulk edit", () => {
  const sizesColours = [
    { name: "Ring size", values: ["10", "12", "14"] },
    { name: "Metal colour", values: ["Yellow", "Rose"] },
  ];

  it("3 sizes × 2 colours creates 6 variants and retires the base variant; saving again creates none", async () => {
    const p = await product([{ stock: 2, price: 500_00 }]);
    const first = await variantAdmin.saveOptions(p.id, sizesColours, "admin");
    expect(first).toEqual({ created: 6, deactivated: 1, combinations: 6 });
    const again = await variantAdmin.saveOptions(p.id, sizesColours, "admin");
    expect(again).toEqual({ created: 0, deactivated: 0, combinations: 6 });

    const vs = await db.productVariant.findMany({ where: { productId: p.id, isActive: true } });
    expect(vs).toHaveLength(6);
    expect(new Set(vs.map((v) => v.sku)).size).toBe(6);
    expect(vs.find((v) => v.label === "Ring size 12 / Rose")?.metalColour).toBe("ROSE");
    expect(await productSummary(p.id)).toMatchObject({ stock: 0 }); // new variants start at 0
    await expectSummaryConsistent(p.id);
  });

  it("removing a value switches its variants off (kept for old orders); no options brings the base back", async () => {
    const p = await product([{ stock: 2 }]);
    await variantAdmin.saveOptions(p.id, sizesColours, "admin");
    const r = await variantAdmin.saveOptions(
      p.id,
      [sizesColours[0]!, { name: "Metal colour", values: ["Yellow"] }],
      "admin",
    );
    expect(r).toMatchObject({ created: 0, deactivated: 3, combinations: 3 });
    expect(await db.productVariant.count({ where: { productId: p.id } })).toBe(7); // none deleted

    await variantAdmin.saveOptions(p.id, [], "admin");
    const active = await db.productVariant.findMany({ where: { productId: p.id, isActive: true } });
    expect(active.map((v) => v.optionKey)).toEqual([""]);
    expect(await productSummary(p.id)).toMatchObject({ stock: 2 }); // base stock is back
  });

  it("bulk edit: SKUs and prices saved; 'from' price follows the cheapest variant", async () => {
    const p = await product([{ stock: 1 }]);
    await variantAdmin.saveOptions(p.id, [sizesColours[0]!], "admin");
    const vs = await db.productVariant.findMany({
      where: { productId: p.id, isActive: true },
      orderBy: { position: "asc" },
    });
    await variantAdmin.bulkUpdateVariants(
      p.id,
      vs.map((v, i) => ({
        id: v.id,
        sku: `${RUN}-band-${i}`,
        priceInPaise: 300_00 - i * 10_00,
        stock: 2,
        netWeightMg: 3000 + i * 100,
        grossWeightMg: null,
        isActive: true,
      })),
      "admin",
    );
    expect(await productSummary(p.id)).toMatchObject({ stock: 6, priceInPaise: 280_00 });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: vs[0]!.id } })).sku).toBe(
      `${RUN}-BAND-0`.toUpperCase(),
    );
    await expectSummaryConsistent(p.id);
  });

  it("bulk edit is all-or-nothing: a SKU owned by another product rolls everything back", async () => {
    const p = await product([
      { stock: 1, price: 100_00 },
      { stock: 1, price: 100_00 },
    ]);
    const other = await product([{ stock: 1 }]);
    const rows = p.variants.map((v, i) => ({
      id: v.id,
      sku: i === 0 ? `${v.sku}-NEW` : other.variants[0]!.sku,
      priceInPaise: 999_00,
      stock: 9,
      netWeightMg: 1000,
      grossWeightMg: null,
      isActive: true,
    }));
    await expect(variantAdmin.bulkUpdateVariants(p.id, rows, "admin")).rejects.toThrow(
      /already used/,
    );
    const now = await db.productVariant.findMany({ where: { productId: p.id } });
    expect(now.map((v) => v.priceInPaise)).toEqual([100_00, 100_00]);
    expect(now.map((v) => v.sku).sort()).toEqual(p.variants.map((v) => v.sku).sort());
  });

  it("bulk edit refuses duplicate SKUs in the grid, bad SKUs, and variants of other products", async () => {
    const p = await product([{ stock: 1 }, { stock: 1 }]);
    const other = await product([{ stock: 1 }]);
    const row = (id: string, sku: string) => ({
      id,
      sku,
      priceInPaise: 1_00,
      stock: 1,
      netWeightMg: 1,
      grossWeightMg: null,
      isActive: true,
    });
    await expect(
      variantAdmin.bulkUpdateVariants(
        p.id,
        [row(p.variants[0]!.id, "dup-1"), row(p.variants[1]!.id, "DUP-1")],
        "admin",
      ),
    ).rejects.toThrow(/twice/);
    await expect(
      variantAdmin.bulkUpdateVariants(p.id, [row(p.variants[0]!.id, "bad sku")], "admin"),
    ).rejects.toThrow(/SKU/);
    await expect(
      variantAdmin.bulkUpdateVariants(p.id, [row(other.variants[0]!.id, "HIJACK-1")], "admin"),
    ).rejects.toThrow(/doesn't belong/);
  });

  it("two variants can swap SKUs in one save", async () => {
    const p = await product([{ stock: 1 }, { stock: 1 }]);
    const [a, b] = p.variants as [V, V];
    await variantAdmin.bulkUpdateVariants(
      p.id,
      [
        {
          id: a.id,
          sku: b.sku,
          priceInPaise: 1_00,
          stock: 1,
          netWeightMg: 1,
          grossWeightMg: null,
          isActive: true,
        },
        {
          id: b.id,
          sku: a.sku,
          priceInPaise: 1_00,
          stock: 1,
          netWeightMg: 1,
          grossWeightMg: null,
          isActive: true,
        },
      ],
      "admin",
    );
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: a.id } })).sku).toBe(b.sku);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: b.id } })).sku).toBe(a.sku);
  });

  it("stock can't be set below units held in checkouts (bulk edit and quick stock edit)", async () => {
    const p = await product([{ stock: 3 }]);
    await db.$transaction((tx) => reserveLines(tx, [line(p.variants[0]!, 2)]));
    await expect(productAdmin.setProductStock(p.id, 1, "admin")).rejects.toThrow(/held/);
    await expect(
      variantAdmin.bulkUpdateVariants(
        p.id,
        [
          {
            id: p.variants[0]!.id,
            sku: p.variants[0]!.sku,
            priceInPaise: 1_00,
            stock: 1,
            netWeightMg: 1,
            grossWeightMg: null,
            isActive: true,
          },
        ],
        "admin",
      ),
    ).rejects.toThrow(/held/);
    expect(await variantStock(p.variants[0]!.id)).toEqual({ stock: 3, reservedStock: 2 });
    await productAdmin.setProductStock(p.id, 2, "admin"); // exactly the held amount is fine
    expect(await productSummary(p.id)).toMatchObject({ stock: 2, reservedStock: 2 });
  });

  it("an admin stock edit racing 10 checkouts never leaves a hold bigger than stock", async () => {
    const p = await product([{ stock: 10 }]);
    const v = p.variants[0]!;
    await Promise.allSettled([
      ...Array.from({ length: 10 }, () => db.$transaction((tx) => reserveLines(tx, [line(v, 1)]))),
      productAdmin.setProductStock(p.id, 4, "admin"),
    ]);
    const s = await variantStock(v.id);
    expect(s.reservedStock).toBeLessThanOrEqual(s.stock);
    await expectSummaryConsistent(p.id);
  });

  it("quick stock edit is refused for a product with options", async () => {
    const p = await product([{ stock: 1 }]);
    await variantAdmin.saveOptions(p.id, [{ name: "Ring size", values: ["10", "12"] }], "admin");
    await expect(productAdmin.setProductStock(p.id, 5, "admin")).rejects.toThrow(/per variant/);
  });
});
