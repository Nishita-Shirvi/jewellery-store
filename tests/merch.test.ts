import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { AUTH_SECRET: "unit-test-secret-at-least-32-characters-long" },
}));

import {
  collectionRulesSchema,
  describeRules,
  hasAnyRule,
  isLive,
  parseDateRange,
  parseIstLocal,
  parseTags,
  percentOff,
  readRules,
  safeContentLink,
  scheduleLabel,
  toIstLocal,
} from "@/lib/merch";
import { Markdown, parseBlocks } from "@/lib/markdown";
import { checkPreviewToken, makePreviewToken, PREVIEW_HOURS } from "@/lib/preview";
import {
  announcementFormSchema,
  collectionFormSchema,
  homeSectionFormSchema,
  parseProductList,
} from "@/lib/validation/content";

/** Phase 24 — merchandising rules, safe text, preview links. */

const T = new Date("2026-11-06T10:00:00Z");
const at = (iso: string) => new Date(iso);

describe("live windows (scheduling without a deploy)", () => {
  const base = { status: "PUBLISHED" as const, startsAt: null, endsAt: null };
  it("published with no dates is live; drafts never are", () => {
    expect(isLive(base, T)).toBe(true);
    expect(isLive({ ...base, status: "DRAFT" }, T)).toBe(false);
  });
  it("starts exactly at its start time and stops exactly at its end time", () => {
    const w = { ...base, startsAt: at("2026-11-06T10:00:00Z"), endsAt: at("2026-11-08T00:00:00Z") };
    expect(isLive(w, at("2026-11-06T09:59:59Z"))).toBe(false);
    expect(isLive(w, at("2026-11-06T10:00:00Z"))).toBe(true);
    expect(isLive(w, at("2026-11-07T23:59:59Z"))).toBe(true);
    expect(isLive(w, at("2026-11-08T00:00:00Z"))).toBe(false);
  });
  it("labels for the admin list", () => {
    expect(scheduleLabel({ ...base, status: "DRAFT" }, T)).toBe("Draft");
    expect(scheduleLabel({ ...base, startsAt: at("2026-11-07T00:00:00Z") }, T)).toBe("Scheduled");
    expect(scheduleLabel({ ...base, endsAt: at("2026-11-05T00:00:00Z") }, T)).toBe("Ended");
    expect(scheduleLabel(base, T)).toBe("Live");
  });
});

describe("sale badges (% off on the server)", () => {
  it("rounds down so a discount is never overstated", () => {
    expect(percentOff(666_700, 1_000_000)).toBe(33); // 33.33 %
    expect(percentOff(800_000, 1_000_000)).toBe(20);
    expect(percentOff(999_999, 1_000_000)).toBeNull(); // < 1 %: no badge
  });
  it("no badge without a real saving", () => {
    expect(percentOff(100, null)).toBeNull();
    expect(percentOff(100, 100)).toBeNull();
    expect(percentOff(100, 90)).toBeNull();
    expect(percentOff(0, 100)).toBeNull();
  });
});

describe("collection rules", () => {
  it("tags are cleaned and de-duplicated", () => {
    expect(parseTags("Bridal, Daily wear , bridal,, GIFT!")).toEqual([
      "bridal",
      "daily-wear",
      "gift",
    ]);
  });
  it("rejects unknown keys, bad tags and min > max; unreadable rules match nothing", () => {
    expect(collectionRulesSchema.safeParse({ hack: 1 }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ tags: ["Not OK"] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ minPrice: 10, maxPrice: 5 }).success).toBe(false);
    expect(readRules({ metalType: "WOOD" })).toBeNull();
    expect(readRules({ tags: ["bridal"] })).toEqual({ tags: ["bridal"] });
  });
  it("an empty rule set is flagged (it would list the whole store)", () => {
    expect(hasAnyRule({})).toBe(false);
    expect(hasAnyRule({ tags: [] })).toBe(false);
    expect(hasAnyRule({ onSale: true })).toBe(true);
    expect(describeRules({ metalType: "GOLD", tags: ["bridal"], maxPrice: 50000 })).toBe(
      "gold · tags: bridal · ₹0–₹50000",
    );
  });
});

describe("dates are India time, whatever the server's time zone", () => {
  it("datetime-local values are read as IST", () => {
    expect(parseIstLocal("2026-11-06T09:00")?.toISOString()).toBe("2026-11-06T03:30:00.000Z");
    expect(parseIstLocal("2026-11-06T00:00")?.toISOString()).toBe("2026-11-05T18:30:00.000Z");
    expect(toIstLocal(at("2026-11-06T03:30:00Z"))).toBe("2026-11-06T09:00");
  });
  it("empty → no limit; nonsense → error", () => {
    expect(parseIstLocal("")).toBeNull();
    expect(parseIstLocal("2026-02-31T10:00")).toBeUndefined();
    expect(parseIstLocal("tomorrow")).toBeUndefined();
  });
  it("festival ranges from config.ini", () => {
    expect(parseDateRange("2026-11-06..2026-11-08")).toEqual({
      from: "2026-11-06",
      to: "2026-11-08",
    });
    expect(parseDateRange("2026-11-08..2026-11-06")).toBeNull();
    expect(parseDateRange("")).toBeNull();
  });
});

describe("links typed by staff can't attack customers", () => {
  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "http://insecure.example.com",
    "vbscript:msgbox",
  ])("refuses %j", (v) => expect(safeContentLink(v)).toBeNull());
  it("allows site paths and https", () => {
    expect(safeContentLink("/collections/bridal")).toBe("/collections/bridal");
    expect(safeContentLink("https://wa.me/919876543210")).toBe("https://wa.me/919876543210");
  });
});

describe("markdown: formatting yes, scripts never", () => {
  const html = (s: string) => renderToStaticMarkup(Markdown({ source: s }));
  it("headings, lists, bold, italic, links", () => {
    const out = html(
      "# Care\n\nKeep it **dry** and *clean*.\n\n- Pouch\n- Cloth\n\n1. One\n2. Two\n\n[Shop](/collections/bridal)",
    );
    expect(out).toContain("<h2");
    expect(out).toContain("<strong>dry</strong>");
    expect(out).toContain("<em>clean</em>");
    expect(out).toMatch(/<ul[^>]*><li>Pouch<\/li><li>Cloth<\/li><\/ul>/);
    expect(out).toMatch(/<ol[^>]*><li>One<\/li><li>Two<\/li><\/ol>/);
    expect(out).toContain('href="/collections/bridal"');
  });
  it("HTML typed into a page is shown as text, not run", () => {
    const out = html('<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });
  it("dangerous links become plain text", () => {
    const out = html("[click](javascript:alert(1)) and [x](//evil.com)");
    expect(out).not.toContain("href");
    expect(out).toContain("click");
  });
  it("external links open safely", () => {
    expect(html("[wa](https://wa.me/1)")).toContain('rel="noopener noreferrer nofollow"');
  });
  it("lists and paragraphs split correctly (no endless loops on odd input)", () => {
    expect(parseBlocks("- a\n- b\ntext\n> q\n\n## h")).toEqual([
      { type: "ul", items: ["a", "b"] },
      { type: "p", lines: ["text"] },
      { type: "quote", lines: ["q"] },
      { type: "h", level: 3, text: "h" },
    ]);
    expect(parseBlocks("\n\n\n")).toEqual([]);
  });
});

describe("preview links", () => {
  const now = Date.parse("2026-11-04T10:00:00Z");
  it("open only the item they were made for, until they expire", () => {
    const token = makePreviewToken("collection", "c1", now);
    expect(checkPreviewToken("collection", "c1", token, now)).toBe(true);
    expect(checkPreviewToken("collection", "c2", token, now)).toBe(false);
    expect(checkPreviewToken("page", "c1", token, now)).toBe(false);
    expect(checkPreviewToken("collection", "c1", token, now + PREVIEW_HOURS * 3_600_000)).toBe(
      false,
    );
  });
  it("can't be extended or forged", () => {
    const token = makePreviewToken("page", "p1", now);
    const [exp, sig] = token.split(".");
    expect(checkPreviewToken("page", "p1", `${Number(exp) + 86_400}.${sig}`, now)).toBe(false);
    expect(checkPreviewToken("page", "p1", `${exp}.${"A".repeat(43)}`, now)).toBe(false);
    expect(checkPreviewToken("page", "p1", "", now)).toBe(false);
    expect(checkPreviewToken("page", "p1", null, now)).toBe(false);
  });
});

describe("admin forms", () => {
  const collection = {
    title: "Diwali Gold",
    slug: "diwali-gold",
    kind: "RULE",
    status: "PUBLISHED",
    ruleTags: "Festive, gift",
    ruleMetal: "GOLD",
    ruleMaxPrice: "100000",
    startsAt: "2026-11-06T00:00",
    endsAt: "2026-11-09T00:00",
  };
  it("rule collection: rules collected, dates read as IST", () => {
    const r = collectionFormSchema.parse(collection);
    expect(r.rules).toEqual({ metalType: "GOLD", tags: ["festive", "gift"], maxPrice: 100000 });
    expect(r.startsAt?.toISOString()).toBe("2026-11-05T18:30:00.000Z");
  });
  it("refuses an end before the start, bad addresses and min > max", () => {
    expect(
      collectionFormSchema.safeParse({ ...collection, endsAt: "2026-11-05T00:00" }).success,
    ).toBe(false);
    expect(collectionFormSchema.safeParse({ ...collection, slug: "Diwali Gold!" }).success).toBe(
      false,
    );
    expect(collectionFormSchema.safeParse({ ...collection, ruleMinPrice: "200000" }).success).toBe(
      false,
    );
  });
  it("manual collections ignore rule fields", () => {
    expect(collectionFormSchema.parse({ ...collection, kind: "MANUAL" }).rules).toEqual({});
  });
  it("homepage sections need what their type shows", () => {
    expect(homeSectionFormSchema.safeParse({ kind: "HERO", title: "Diwali" }).success).toBe(false); // no image
    expect(homeSectionFormSchema.safeParse({ kind: "PRODUCTS", title: "Bridal" }).success).toBe(
      false,
    ); // no collection
    expect(
      homeSectionFormSchema.safeParse({ kind: "BANNER", imageDesktop: "https://evil.com/x.png" })
        .success,
    ).toBe(false); // not our images
    expect(
      homeSectionFormSchema.safeParse({ kind: "TEXT", title: "Hi", linkUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(homeSectionFormSchema.safeParse({ kind: "TEXT", title: "Our story" }).success).toBe(
      true,
    );
  });
  it("announcement links must be safe", () => {
    const ok = { message: "Free shipping today", status: "PUBLISHED" };
    expect(announcementFormSchema.safeParse({ ...ok, linkUrl: "/products" }).success).toBe(true);
    expect(announcementFormSchema.safeParse({ ...ok, linkUrl: "//evil.com" }).success).toBe(false);
  });
  it("hand-picked list accepts addresses or product links, once each", () => {
    expect(
      parseProductList(
        "gold-ring\nhttps://shop.in/products/silver-anklet?x=1\ngold-ring\nBad Slug!",
      ),
    ).toEqual(["gold-ring", "silver-anklet"]);
  });
});
