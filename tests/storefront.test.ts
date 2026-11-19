import { describe, expect, it, vi } from "vitest";
import {
  isLargeRateChange,
  priceBreakup,
  rateChangeBps,
  rateLinkedPrice,
} from "@/lib/metal-pricing";
import { OCCASIONS, occasionFromSlug, occasionLabel } from "@/lib/storefront";
import { STARTER_COLLECTIONS } from "@/lib/merch";
import { whatsappDigits, whatsappLink } from "@/lib/support";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { productListQuerySchema } from "@/lib/validation/catalog";
import { productsUrl } from "@/lib/catalog-url";
import { visitRequestSchema } from "@/lib/validation/storefront";

vi.mock("server-only", () => ({}));

describe("rate-linked pricing", () => {
  it("adds metal value, making and stones, then GST, rounded to the rupee", () => {
    // 4.125 g × ₹7,250/g = ₹29,906.25; + ₹3,000 making + ₹500 stones = ₹33,406.25; × 1.03 = ₹34,408.44
    const b = priceBreakup({
      netWeightMg: 4125,
      ratePerGramInPaise: 7_250_00,
      makingChargeInPaise: 3_000_00,
      stoneChargeInPaise: 500_00,
      gstRateBps: 300,
    });
    expect(b.metalValueInPaise).toBe(2_990_625);
    expect(b.priceInPaise).toBe(3_440_800);
    expect(b.metalValueInPaise + b.makingChargeInPaise + b.stoneChargeInPaise + b.gstInPaise).toBe(
      b.priceInPaise,
    );
  });

  it("is integer-only and never negative for normal input", () => {
    const price = rateLinkedPrice({
      netWeightMg: 1,
      ratePerGramInPaise: 1,
      makingChargeInPaise: 0,
      stoneChargeInPaise: 0,
      gstRateBps: 300,
    });
    expect(Number.isInteger(price)).toBe(true);
    expect(price).toBeGreaterThanOrEqual(0);
  });

  it("flags large rate changes (the per-10-gram typo)", () => {
    expect(rateChangeBps(null, 7_250_00)).toBeNull();
    expect(rateChangeBps(7_000_00, 7_350_00)).toBe(500);
    expect(isLargeRateChange(7_250_00, 72_500_00)).toBe(true);
    expect(isLargeRateChange(7_250_00, 7_400_00)).toBe(false);
    expect(isLargeRateChange(undefined, 72_500_00)).toBe(false);
  });
});

describe("occasions and catalogue URLs", () => {
  it("occasions are product tags, matching the starter occasion collections", () => {
    expect(occasionFromSlug("daily-wear")).toBe("daily-wear");
    expect(occasionFromSlug("nonsense")).toBeUndefined();
    expect(occasionLabel("gift")).toBe("Gifting");
    const tags = new Set<string>(OCCASIONS.map((o) => o.tag));
    for (const c of STARTER_COLLECTIONS) for (const t of c.tags) expect(tags.has(t)).toBe(true);
  });

  it("reads the new filters from the URL and writes them back", () => {
    const q = productListQuerySchema.parse({
      occasion: "bridal",
      colour: "ROSE",
      minWeight: "2.5",
      maxWeight: "10",
    });
    expect(q).toMatchObject({ occasion: "bridal", colour: "ROSE", minWeight: 2.5, maxWeight: 10 });
    expect(productsUrl(q)).toBe("/products?occasion=bridal&colour=ROSE&minWeight=2.5&maxWeight=10");
    // Bad values are ignored rather than erroring.
    expect(productListQuerySchema.parse({ occasion: "xyz", minWeight: "-1" })).toMatchObject({
      occasion: undefined,
      minWeight: undefined,
    });
  });
});

describe("WhatsApp links", () => {
  it("normalises Indian numbers", () => {
    expect(whatsappDigits("98765 43210")).toBe("919876543210");
    expect(whatsappDigits("+91 98765-43210")).toBe("919876543210");
    expect(whatsappDigits("123")).toBeNull();
    expect(whatsappLink("9876543210", "Hi & bye")).toBe(
      "https://wa.me/919876543210?text=Hi%20%26%20bye",
    );
  });
});

describe("visit request form", () => {
  const ok = {
    name: "Asha",
    phone: "+91 98765 43210",
    preferredDate: "2026-12-01",
    timeSlot: "Morning (10 am – 1 pm)",
  };
  it("accepts a valid request and normalises the phone", () => {
    const parsed = visitRequestSchema.parse(ok);
    expect(parsed.phone).toBe("9876543210");
    expect(parsed.email).toBeNull();
  });
  it("rejects bad phones, slots and a filled honeypot", () => {
    expect(visitRequestSchema.safeParse({ ...ok, phone: "12345" }).success).toBe(false);
    expect(visitRequestSchema.safeParse({ ...ok, timeSlot: "Midnight" }).success).toBe(false);
    expect(visitRequestSchema.safeParse({ ...ok, website: "spam" }).success).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it("allows same-site paths", () => {
    expect(safeRedirectPath("/account/orders?page=2")).toBe("/account/orders?page=2");
  });
  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/%09/x\n/evil.com",
    "https://evil.com",
    "/\\\\evil",
  ])("blocks %j", (value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
});
