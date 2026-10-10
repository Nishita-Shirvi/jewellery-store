import { describe, expect, it } from "vitest";
import {
  mgToGramsInput,
  paiseToRupeesInput,
  parseGramsToMg,
  parseRupeesToPaise,
} from "@/lib/money";
import { canTransition } from "@/lib/order-status";
import { productFormSchema, slugify } from "@/lib/validation/admin";

describe("money parsing (no floating point)", () => {
  it.each([
    ["68500", 6850000],
    ["68,500", 6850000],
    ["₹ 2,95,000", 29500000],
    ["1999.5", 199950],
    ["1999.50", 199950],
    ["0.07", 7],
    ["19.99", 1999],
  ])("rupees %s → %d paise", (input, paise) => expect(parseRupeesToPaise(input)).toBe(paise));
  it.each(["", "abc", "1.234", "-5", "1e5"])("rejects %s", (input) =>
    expect(parseRupeesToPaise(input)).toBeNull(),
  );
  it("round-trips paise", () => {
    expect(paiseToRupeesInput(199950)).toBe("1999.50");
    expect(paiseToRupeesInput(6850000)).toBe("68500");
  });
  it("grams → milligrams", () => {
    expect(parseGramsToMg("4.125")).toBe(4125);
    expect(parseGramsToMg("28")).toBe(28000);
    expect(parseGramsToMg("4.1")).toBe(4100);
    expect(parseGramsToMg("4.1234")).toBeNull();
    expect(mgToGramsInput(4100)).toBe("4.1");
    expect(mgToGramsInput(28000)).toBe("28");
  });
});

describe("order status transitions", () => {
  it("allows the normal flow", () => {
    expect(canTransition("PAID", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransition("PAID", "CANCELLED")).toBe(true);
  });
  it("blocks skipping, going backwards and marking paid by hand", () => {
    expect(canTransition("PAID", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "SHIPPED")).toBe(false);
    expect(canTransition("PENDING", "PAID")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(false);
    expect(canTransition("CANCELLED", "PAID")).toBe(false);
  });
});

describe("product form", () => {
  const base = {
    name: "Test Ring",
    description: "A lovely test ring for the store.",
    categoryId: "abc123",
    price: "12,500",
    makingCharge: "",
    stock: "3",
    metalType: "GOLD",
    purity: "K22",
    metalColour: "YELLOW",
    netWeight: "4.1",
    grossWeight: "",
    gemstone: "",
    huid: "",
    images: "/images/products/infinity-ring.svg",
  };
  it("parses a valid product", () => {
    const p = productFormSchema.parse({ ...base, isActive: "on" });
    expect(p).toMatchObject({
      price: 1250000,
      netWeight: 4100,
      grossWeight: null,
      isActive: true,
      isFeatured: false,
    });
  });
  it("rejects outside image URLs and bad HUIDs", () => {
    expect(
      productFormSchema.safeParse({ ...base, images: "https://evil.example/x.png" }).success,
    ).toBe(false);
    expect(productFormSchema.safeParse({ ...base, huid: "12" }).success).toBe(false);
  });
  it("makes slugs", () => expect(slugify("Men's Gold Kada (22K)")).toBe("men-s-gold-kada-22k"));
});

describe("formatINR", async () => {
  const { formatINR } = await import("@/lib/format");
  it("shows whole rupees without decimals and keeps paise when present", () => {
    expect(formatINR(6850000)).toBe("₹68,500");
    expect(formatINR(29500000)).toBe("₹2,95,000");
    expect(formatINR(875050)).toBe("₹8,750.50");
    expect(formatINR(199999)).toBe("₹1,999.99");
  });
});
