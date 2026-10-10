import { describe, expect, it, vi } from "vitest";
import { amountToFreeShipping, shippingFeeFor } from "@/lib/shipping-fee";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/env", () => ({ env: { SHIPROCKET_API_BASE: "x" } }));
const { mapShiprocketStatus, trackingUrlFor } = await import("@/lib/shipping/shiprocket");

const rule = { feeInPaise: 99_00, freeAboveInPaise: 999_00 };

describe("shipping fee rule", () => {
  it("charges the flat fee below the threshold", () =>
    expect(shippingFeeFor(500_00, rule)).toBe(99_00));
  it("is free at and above the threshold", () => {
    expect(shippingFeeFor(999_00, rule)).toBe(0);
    expect(shippingFeeFor(68_500_00, rule)).toBe(0);
  });
  it("is free for an empty cart", () => expect(shippingFeeFor(0, rule)).toBe(0));
  it("says how much more is needed for free shipping", () => {
    expect(amountToFreeShipping(900_00, rule)).toBe(99_00);
    expect(amountToFreeShipping(1_500_00, rule)).toBe(0);
  });
});

describe("Shiprocket status mapping", () => {
  it.each([
    [42, "PICKED UP", "PICKED_UP"],
    [6, "SHIPPED", "IN_TRANSIT"],
    [18, "IN TRANSIT", "IN_TRANSIT"],
    [17, "OUT FOR DELIVERY", "OUT_FOR_DELIVERY"],
    [7, "DELIVERED", "DELIVERED"],
    [9, "RTO INITIATED", "RTO"],
    [8, "CANCELED", "CANCELLED"],
  ])("id %s (%s) → %s", (id, label, expected) =>
    expect(mapShiprocketStatus(id, label)).toBe(expected),
  );
  it("falls back to the label when the id is unknown", () => {
    expect(mapShiprocketStatus(999, "Reached at Destination Hub")).toBe("IN_TRANSIT");
    expect(mapShiprocketStatus(null, "Delivered")).toBe("DELIVERED");
  });
  it("never treats 'undelivered' as delivered", () =>
    expect(mapShiprocketStatus(null, "UNDELIVERED")).toBeNull());
  it("ignores unknown statuses", () =>
    expect(mapShiprocketStatus(null, "Weight discrepancy")).toBeNull());
  it("builds tracking links", () =>
    expect(trackingUrlFor("AWB123")).toBe("https://shiprocket.co/tracking/AWB123"));
});

describe("parseShiprocketDate", async () => {
  const { parseShiprocketDate } = await import("@/lib/shipping/dates");
  const fallback = new Date("2000-01-01T00:00:00Z");
  it("reads both Shiprocket formats as India time", () => {
    expect(parseShiprocketDate("2026-10-09 14:05:00", fallback).toISOString()).toBe(
      "2026-10-09T08:35:00.000Z",
    );
    expect(parseShiprocketDate("09 10 2026 14:05:00", fallback).toISOString()).toBe(
      "2026-10-09T08:35:00.000Z",
    );
  });
  it("falls back for missing or odd values", () => {
    expect(parseShiprocketDate(undefined, fallback)).toBe(fallback);
    expect(parseShiprocketDate("yesterday", fallback)).toBe(fallback);
  });
});
