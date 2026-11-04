import { describe, expect, it } from "vitest";
import {
  addAttribution,
  ATTRIBUTION_MAX,
  parseAttribution,
  parseRecent,
  pickUpsell,
  pushRecent,
  rankSimilar,
  rate,
  RECENT_MAX,
  trendWeight,
} from "@/lib/reco";

/** Phase 25 — recommendation rules (pure). */

describe("recently viewed cookie", () => {
  it("newest first, no duplicates, capped", () => {
    let v = "";
    for (let i = 0; i < RECENT_MAX + 5; i++) v = pushRecent(v, `ring-${i}`);
    v = pushRecent(v, "ring-3");
    const list = parseRecent(v);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe("ring-3");
    expect(new Set(list).size).toBe(list.length);
  });
  it("tampered values are cleaned, never trusted", () => {
    expect(parseRecent("ok-ring.<script>.Bad Slug.ok-ring.%E0%A4%A")).toEqual(["ok-ring"]);
    expect(parseRecent("%")).toEqual([]);
    expect(parseRecent(undefined)).toEqual([]);
    expect(pushRecent("a", "../etc/passwd")).toBe("a");
  });
});

describe("attribution cookie (which widget led to which product)", () => {
  const id = (n: number) => `cm${String(n).padStart(10, "0")}`;
  it("round-trips, newest wins for the same product, capped", () => {
    let v = addAttribution(null, id(1), "similar");
    v = addAttribution(v, id(1), "trending");
    expect(parseAttribution(v)).toEqual({ [id(1)]: "trending" });
    for (let i = 2; i < ATTRIBUTION_MAX + 10; i++) v = addAttribution(v, id(i), "upsell");
    const parsed = parseAttribution(v);
    expect(Object.keys(parsed)).toHaveLength(ATTRIBUTION_MAX);
    expect(parsed[id(ATTRIBUTION_MAX + 9)]).toBe("upsell");
  });
  it("junk, unknown widgets and prototype tricks are ignored", () => {
    expect(parseAttribution("not json")).toEqual({});
    expect(parseAttribution(encodeURIComponent(JSON.stringify([1, 2])))).toEqual({});
    expect(
      parseAttribution(encodeURIComponent(JSON.stringify({ [id(1)]: "hacked", short: "similar" }))),
    ).toEqual({});
    const proto = parseAttribution(encodeURIComponent('{"__proto__":{"x":"similar"}}'));
    expect(Object.keys(proto)).toEqual([]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(parseAttribution("x".repeat(5000))).toEqual({});
  });
});

describe("scores", () => {
  it("trending: recent days weigh more, older than 14 days not at all", () => {
    expect(trendWeight(0)).toBe(14);
    expect(trendWeight(0.9)).toBe(14);
    expect(trendWeight(13)).toBe(1);
    expect(trendWeight(14)).toBe(0);
    expect(trendWeight(-1)).toBe(0);
  });
  it("upsell: covers the gap alone, cheapest first, in stock, not already in the cart", () => {
    const c = (id: string, price: number, inStock = true) => ({ id, priceInPaise: price, inStock });
    const picked = pickUpsell(
      [c("a", 900), c("b", 1500), c("c", 1100), c("d", 1000, false), c("e", 1050)],
      1000,
      new Set(["e"]),
      2,
    );
    expect(picked.map((p) => p.id)).toEqual(["c", "b"]);
    expect(pickUpsell([c("a", 5000)], 0, new Set())).toEqual([]);
  });
  it("similar: same category, then closest price, then same metal", () => {
    const t = { id: "t", categoryId: "rings", priceInPaise: 10_000, metalType: "GOLD" };
    const ranked = rankSimilar(t, [
      { id: "t", categoryId: "rings", priceInPaise: 10_000, metalType: "GOLD" }, // itself
      { id: "far", categoryId: "rings", priceInPaise: 90_000, metalType: "GOLD" },
      { id: "near", categoryId: "rings", priceInPaise: 11_000, metalType: "SILVER" },
      { id: "other", categoryId: "earrings", priceInPaise: 10_000, metalType: "GOLD" },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["near", "far", "other"]);
  });
  it("rates for the report", () => {
    expect(rate(5, 200)).toBe("2.5%");
    expect(rate(1, 0)).toBe("—");
  });
});
