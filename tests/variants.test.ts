import { describe, expect, it } from "vitest";
import {
  MAX_VARIANTS,
  combinations,
  duplicateSkus,
  enumOverrides,
  lineName,
  optionKeyFor,
  optionsInputSchema,
  parseValueList,
  skuSchema,
  suggestSku,
  variantJewellery,
  variantLabel,
} from "@/lib/variants";
import { addToCartSchema, cartLineSchema, updateQuantitySchema } from "@/lib/validation/cart";

describe("SKU rules", () => {
  it.each(["PLAIN-GOLD-BAND-12-ROSE", "abc", "R12", "a1-b2"])("accepts %s", (sku) => {
    expect(skuSchema.safeParse(sku).success).toBe(true);
  });
  it("upper-cases and trims", () => {
    expect(skuSchema.parse("  ring-12 ")).toBe("RING-12");
  });
  it.each([
    ["too short", "AB"],
    ["leading dash", "-RING"],
    ["trailing dash", "RING-"],
    ["double dash", "RING--12"],
    ["space", "RING 12"],
    ["slash", "RING/12"],
    ["unicode", "RİNG"],
    ["sql-ish", "R';DROP"],
    ["too long", "A".repeat(81)],
  ])("rejects %s", (_why, sku) => {
    expect(skuSchema.safeParse(sku).success).toBe(false);
  });
  it("finds duplicates case-insensitively", () => {
    expect(duplicateSkus(["A-1", "a-1", "B-2", "B-2 "])).toEqual(["A-1", "B-2"]);
    expect(duplicateSkus(["A-1", "B-2"])).toEqual([]);
  });
  it("suggests a clean SKU from slug + values", () => {
    expect(suggestSku("plain-gold-band", ["12", "Rose"])).toBe("PLAIN-GOLD-BAND-12-ROSE");
    expect(suggestSku("ring", ["16.5 mm", "White/Rose"])).toBe("RING-16-5-MM-WHITE-ROSE");
    const long = suggestSku("x".repeat(90), ["12"]);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(skuSchema.safeParse(long).success).toBe(true);
  });
});

describe("combinations", () => {
  it("3 sizes × 2 colours = 6, in option order", () => {
    const c = combinations([
      ["10", "12", "14"],
      ["Yellow", "Rose"],
    ]);
    expect(c).toHaveLength(6);
    expect(c[0]).toEqual(["10", "Yellow"]);
    expect(c[5]).toEqual(["14", "Rose"]);
  });
  it("no options = one empty combination (the base variant)", () => {
    expect(combinations([])).toEqual([[]]);
  });
  it("option key ignores order, so the same combination can't be created twice", () => {
    expect(optionKeyFor(["b", "a"])).toBe(optionKeyFor(["a", "b"]));
    expect(optionKeyFor([])).toBe("");
  });
});

describe("options input", () => {
  const ok = [
    { name: "Ring size", values: ["10", "12", "14"] },
    { name: "Metal colour", values: ["Yellow", "Rose"] },
  ];
  it("accepts a normal 3 × 2 setup", () => {
    expect(optionsInputSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects duplicate option names and duplicate values (any case)", () => {
    expect(
      optionsInputSchema.safeParse([ok[0], { name: "ring SIZE", values: ["1"] }]).success,
    ).toBe(false);
    expect(optionsInputSchema.safeParse([{ name: "Size", values: ["12", "12 "] }]).success).toBe(
      false,
    );
    expect(
      optionsInputSchema.safeParse([{ name: "Colour", values: ["Rose", "rose"] }]).success,
    ).toBe(false);
  });
  it("rejects an option with no values, a 4th option, and too many combinations", () => {
    expect(optionsInputSchema.safeParse([{ name: "Size", values: [] }]).success).toBe(false);
    const four = ["A", "B", "C", "D"].map((name) => ({ name, values: ["1"] }));
    expect(optionsInputSchema.safeParse(four).success).toBe(false);
    const big = [
      { name: "A", values: Array.from({ length: 11 }, (_, i) => `a${i}`) },
      { name: "B", values: Array.from({ length: 10 }, (_, i) => `b${i}`) },
    ];
    expect(11 * 10).toBeGreaterThan(MAX_VARIANTS);
    expect(optionsInputSchema.safeParse(big).success).toBe(false);
  });
  it("rejects markup in names/values", () => {
    expect(optionsInputSchema.safeParse([{ name: "<script>", values: ["1"] }]).success).toBe(false);
    expect(optionsInputSchema.safeParse([{ name: "Size", values: ["<b>"] }]).success).toBe(false);
  });
  it("splits value lists on commas and new lines", () => {
    expect(parseValueList(" 10, 12 ,\n14,, ")).toEqual(["10", "12", "14"]);
  });
});

describe("labels and jewellery facts", () => {
  it("labels sizes with their option name, other values alone", () => {
    expect(
      variantLabel([
        { name: "Ring size", value: "12" },
        { name: "Metal colour", value: "Rose" },
      ]),
    ).toBe("Ring size 12 / Rose");
  });
  it("names order lines with the variant, and without it for products with no options", () => {
    expect(lineName("Plain Gold Band", "Ring size 12 / Rose")).toBe(
      "Plain Gold Band (Ring size 12 / Rose)",
    );
    expect(lineName("Classic Solitaire Ring", "")).toBe("Classic Solitaire Ring");
  });
  it("maps colour / purity options onto the variant", () => {
    expect(
      enumOverrides([
        { name: "Metal colour", value: "Rose gold" },
        { name: "Purity", value: "18 K" },
      ]),
    ).toEqual({ metalColour: "ROSE", purity: "K18" });
    expect(enumOverrides([{ name: "Ring size", value: "12" }])).toEqual({
      metalColour: null,
      purity: null,
    });
  });
  it("variant weight wins; colour/purity fall back to the product", () => {
    const product = { metalType: "GOLD", purity: "K22", metalColour: "YELLOW" } as const;
    expect(
      variantJewellery(product, {
        purity: null,
        metalColour: "ROSE",
        netWeightMg: 3150,
        grossWeightMg: null,
      }),
    ).toEqual({
      metalType: "GOLD",
      purity: "K22",
      metalColour: "ROSE",
      netWeightMg: 3150,
      grossWeightMg: null,
    });
  });
});

describe("cart input validation", () => {
  it("still accepts guest cookies written before variants existed", () => {
    expect(cartLineSchema.safeParse({ productId: "abc123", quantity: 1 }).success).toBe(true);
  });
  it("accepts a variant on add, and requires one on update/remove", () => {
    expect(
      addToCartSchema.safeParse({ productId: "p1", variantId: "v1", quantity: 1 }).success,
    ).toBe(true);
    expect(addToCartSchema.safeParse({ productId: "p1", quantity: 1 }).success).toBe(true);
    expect(updateQuantitySchema.safeParse({ productId: "p1", quantity: 1 }).success).toBe(false);
  });
  it("rejects injected variant ids", () => {
    expect(
      addToCartSchema.safeParse({ productId: "p1", variantId: "v1' OR 1=1", quantity: 1 }).success,
    ).toBe(false);
  });
});
