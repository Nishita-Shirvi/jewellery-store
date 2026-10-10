import { describe, expect, it } from "vitest";
import { maxAllowed, mergeLines, priceCart, type PricedProduct } from "@/services/pricing";

function product(overrides: Partial<PricedProduct> & { id: string }): PricedProduct {
  return {
    slug: overrides.id,
    name: overrides.id,
    image: "/x.svg",
    priceInPaise: 100_00,
    stock: 5,
    isAvailable: true,
    materialSummary: "22K yellow gold · 4 g",
    ...overrides,
  };
}

const map = (...products: PricedProduct[]) => new Map(products.map((p) => [p.id, p]));

describe("priceCart", () => {
  it("uses database prices and adds up line totals in paise", () => {
    const cart = priceCart(
      [
        { productId: "ring", quantity: 2 },
        { productId: "chain", quantity: 1 },
      ],
      map(
        product({ id: "ring", priceInPaise: 68_500_00 }),
        product({ id: "chain", priceInPaise: 2_450_00 }),
      ),
    );
    expect(cart.items.map((i) => i.lineTotalInPaise)).toEqual([137_000_00, 2_450_00]);
    expect(cart.subtotalInPaise).toBe(139_450_00);
    expect(cart.itemCount).toBe(3);
    expect(cart.hasIssues).toBe(false);
  });

  it("reduces quantities above stock and flags them", () => {
    const cart = priceCart(
      [{ productId: "ring", quantity: 4 }],
      map(product({ id: "ring", stock: 1 })),
    );
    expect(cart.items[0]).toMatchObject({ quantity: 1, requestedQuantity: 4, issue: "reduced" });
    expect(cart.subtotalInPaise).toBe(100_00);
  });

  it("caps at the per-item maximum even with plenty of stock", () => {
    const cart = priceCart(
      [{ productId: "ring", quantity: 10 }],
      map(product({ id: "ring", stock: 500 })),
    );
    expect(cart.items[0]?.maxQuantity).toBe(10);
  });

  it("excludes out-of-stock and unavailable products from the total", () => {
    const cart = priceCart(
      [
        { productId: "sold", quantity: 1 },
        { productId: "hidden", quantity: 1 },
        { productId: "ok", quantity: 1 },
      ],
      map(
        product({ id: "sold", stock: 0 }),
        product({ id: "hidden", isAvailable: false }),
        product({ id: "ok", priceInPaise: 1_950_00 }),
      ),
    );
    expect(cart.items.map((i) => i.issue)).toEqual(["out_of_stock", "unavailable", null]);
    expect(cart.items.map((i) => i.maxQuantity)).toEqual([0, 0, 5]);
    expect(cart.subtotalInPaise).toBe(1_950_00);
    expect(cart.itemCount).toBe(1);
    expect(cart.hasIssues).toBe(true);
  });

  it("drops lines for products that no longer exist", () => {
    const cart = priceCart([{ productId: "deleted", quantity: 2 }], map());
    expect(cart.items).toHaveLength(0);
    expect(cart.subtotalInPaise).toBe(0);
  });
});

describe("mergeLines", () => {
  it("adds quantities of the same product from guest and saved carts", () => {
    expect(
      mergeLines(
        [{ productId: "a", quantity: 1 }],
        [
          { productId: "a", quantity: 2 },
          { productId: "b", quantity: 1 },
        ],
      ),
    ).toEqual([
      { productId: "a", quantity: 3 },
      { productId: "b", quantity: 1 },
    ]);
  });
});

describe("maxAllowed", () => {
  it("is the smaller of stock and 10, never negative", () => {
    expect(maxAllowed(3)).toBe(3);
    expect(maxAllowed(50)).toBe(10);
    expect(maxAllowed(-2)).toBe(0);
  });
});
