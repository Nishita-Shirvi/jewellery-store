import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  EVERYDAY_THEME,
  THEME_PRESETS,
  emphasisParts,
  liveTheme,
  themeStatus,
  todayInIndia,
  type Appearance,
  type Theme,
} from "@/lib/appearance";
import { appearanceSchema, internalPath, themeSchema } from "@/lib/validation/appearance";

function dated(id: string, from: string, until: string): Theme {
  return { ...EVERYDAY_THEME, id, name: id, isDefault: false, from, until };
}

const appearance: Appearance = {
  defaultMode: "system",
  themes: [
    EVERYDAY_THEME,
    dated("diwali", "2026-11-01", "2026-11-12"),
    dated("wedding", "2026-11-10", "2027-02-15"),
    dated("old", "2025-10-01", "2025-10-20"),
  ],
};

describe("which theme is live", () => {
  it("shows Everyday when no festival theme is on", () => {
    expect(liveTheme(appearance, "2026-10-15").id).toBe("everyday");
    expect(liveTheme(DEFAULT_APPEARANCE, "2026-11-20").id).toBe("everyday");
  });

  it("includes the first and last day", () => {
    expect(liveTheme(appearance, "2026-11-01").id).toBe("diwali");
    expect(liveTheme(appearance, "2027-02-15").id).toBe("wedding");
    expect(liveTheme(appearance, "2027-02-16").id).toBe("everyday");
  });

  it("lets the theme that started later win when two overlap", () => {
    expect(liveTheme(appearance, "2026-11-11").id).toBe("wedding");
    expect(themeStatus(appearance.themes[1]!, appearance, "2026-11-11")).toBe("overlapped");
    expect(themeStatus(appearance.themes[2]!, appearance, "2026-11-11")).toBe("live");
  });

  it("labels themes for the admin list", () => {
    expect(themeStatus(EVERYDAY_THEME, appearance, "2026-11-11")).toBe("default");
    expect(themeStatus(appearance.themes[3]!, appearance, "2026-11-11")).toBe("ended");
    expect(themeStatus(appearance.themes[2]!, appearance, "2026-11-05")).toBe("upcoming");
    expect(themeStatus(dated("x", "", ""), appearance, "2026-11-05")).toBe("off");
  });

  it("uses the date in India", () => {
    // 20:00 UTC on 20 Nov is 01:30 on 21 Nov in India.
    expect(todayInIndia(new Date("2026-11-20T20:00:00Z"))).toBe("2026-11-21");
    expect(todayInIndia(new Date("2026-11-20T10:00:00Z"))).toBe("2026-11-20");
  });

  it("splits *stars* for italics", () => {
    expect(emphasisParts("Gold for *forever.*")).toEqual(["Gold for ", "forever.", ""]);
  });
});

describe("Admin → Appearance input", () => {
  it("accepts the built-in default and every preset", () => {
    expect(appearanceSchema.safeParse(DEFAULT_APPEARANCE).success).toBe(true);
    for (const p of THEME_PRESETS) {
      const t = { ...p.theme, id: `p-${p.key}`, from: "2026-11-01", until: "2026-11-10" };
      expect(themeSchema.safeParse(t).error?.issues ?? []).toEqual([]);
    }
  });

  it("only lets the button go to a page on this site", () => {
    expect(internalPath.safeParse("/products?occasion=festive").success).toBe(true);
    expect(internalPath.safeParse("/visit").success).toBe(true);
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "products",
    ])
      expect(internalPath.safeParse(bad).success, bad).toBe(false);
  });

  it("refuses colours that aren't #rrggbb", () => {
    const t = { ...EVERYDAY_THEME, colors: { ...EVERYDAY_THEME.colors, bg: "red" } };
    expect(themeSchema.safeParse(t).success).toBe(false);
  });

  it("refuses photos and videos from other websites", () => {
    const photo = {
      ...EVERYDAY_THEME,
      hero: { ...EVERYDAY_THEME.hero, image: "https://evil.example/a.jpg" },
    };
    expect(themeSchema.safeParse(photo).success).toBe(false);
    const video = {
      ...EVERYDAY_THEME,
      hero: { ...EVERYDAY_THEME.hero, layout: "video", video: "https://evil.example/a.mp4" },
    };
    expect(themeSchema.safeParse(video).success).toBe(false);
  });

  it("needs a video for the video layout", () => {
    const t = { ...EVERYDAY_THEME, hero: { ...EVERYDAY_THEME.hero, layout: "video", video: "" } };
    expect(themeSchema.safeParse(t).success).toBe(false);
  });

  it("needs both dates, in order, on a festival theme", () => {
    expect(themeSchema.safeParse(dated("a", "", "2026-11-10")).success).toBe(false);
    expect(themeSchema.safeParse(dated("a", "2026-11-10", "2026-11-01")).success).toBe(false);
    expect(themeSchema.safeParse(dated("a", "2026-11-01", "2026-11-01")).success).toBe(true);
  });

  it("keeps exactly one Everyday theme with unique ids", () => {
    expect(
      appearanceSchema.safeParse({ ...appearance, themes: appearance.themes.slice(1) }).success,
    ).toBe(false);
    expect(
      appearanceSchema.safeParse({
        ...appearance,
        themes: [...appearance.themes, dated("diwali", "2026-01-01", "2026-01-02")],
      }).success,
    ).toBe(false);
    expect(appearanceSchema.safeParse(appearance).success).toBe(true);
  });
});
