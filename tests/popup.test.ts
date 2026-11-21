import { describe, expect, it } from "vitest";
import { DEFAULT_POPUP, popupAllowedOn, popupDue, popupLive, visitDays } from "@/lib/popup";
import { popupSchema } from "@/lib/validation/popup";

const on = { ...DEFAULT_POPUP, on: true };
const DAY = 86_400_000;

describe("shop popup", () => {
  it("is off until switched on, and keeps to its dates", () => {
    expect(popupLive(DEFAULT_POPUP, "2026-11-21")).toBe(false);
    expect(popupLive(on, "2026-11-21")).toBe(true);
    const dated = { ...on, from: "2026-11-15", until: "2026-11-30" };
    expect(popupLive(dated, "2026-11-14")).toBe(false);
    expect(popupLive(dated, "2026-11-15")).toBe(true);
    expect(popupLive(dated, "2026-11-30")).toBe(true);
    expect(popupLive(dated, "2026-12-01")).toBe(false);
  });

  it("never interrupts buying, signing in, account or admin pages", () => {
    expect(popupAllowedOn("/", "home")).toBe(true);
    expect(popupAllowedOn("/products", "home")).toBe(false);
    expect(popupAllowedOn("/products/floral-band-ring", "all")).toBe(true);
    for (const p of [
      "/checkout",
      "/cart",
      "/account/orders",
      "/login",
      "/register",
      "/admin",
      "/orders/x/success",
    ])
      expect(popupAllowedOn(p, "all"), p).toBe(false);
  });

  it("shows again only after its period, or when the popup changes", () => {
    const now = Date.now();
    expect(popupDue(null, on, now)).toBe(true);
    const seen = { at: now - 2 * DAY, version: on.version };
    expect(popupDue(seen, { ...on, againDays: 7 }, now)).toBe(false);
    expect(popupDue(seen, { ...on, againDays: 1 }, now)).toBe(true);
    expect(
      popupDue({ at: now - 400 * DAY, version: on.version }, { ...on, againDays: 0 }, now),
    ).toBe(false);
    expect(popupDue(seen, { ...on, againDays: 0, version: "new" }, now)).toBe(true);
  });

  it("offers the next five days for a visit", () => {
    const days = visitDays("2026-11-21");
    expect(days.map((d) => d.value)).toEqual([
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
    ]);
    expect(days[0]!.label).toMatch(/Sun.*22.*Nov/);
    expect(visitDays("2026-12-31", 1)[0]!.value).toBe("2027-01-01");
  });

  it("accepts the built-in example and refuses outside pictures and links", () => {
    expect(popupSchema.safeParse(DEFAULT_POPUP).success).toBe(true);
    expect(
      popupSchema.safeParse({ ...DEFAULT_POPUP, image: "https://evil.example/x.jpg" }).success,
    ).toBe(false);
    expect(
      popupSchema.safeParse({ ...DEFAULT_POPUP, action: "link", link: "//evil.example" }).success,
    ).toBe(false);
    expect(popupSchema.safeParse({ ...DEFAULT_POPUP, againDays: 3 }).success).toBe(false);
    expect(
      popupSchema.safeParse({ ...DEFAULT_POPUP, from: "2026-12-01", until: "2026-11-01" }).success,
    ).toBe(false);
  });
});
