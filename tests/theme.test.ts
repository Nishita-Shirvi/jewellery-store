import { describe, expect, it } from "vitest";
import { DEFAULT_COLORS, contrast, mix, parseMode, shopTokens, themeCss } from "@/lib/theme";

describe("theme colours", () => {
  it("blends colours", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#6b1f2a", "#6b1f2a", 0.3)).toBe("#6b1f2a");
    expect(mix("#102030", "#ffffff", 0)).toBe("#102030");
  });

  it("measures WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBe(1);
  });

  // Text pairs a shopper reads. AA needs 4.5:1 for normal text.
  const pairs: [string, string][] = [
    ["ink", "bg"],
    ["ink", "card"],
    ["muted", "bg"],
    ["muted", "alt"],
    ["head", "bg"],
    ["eyebrow", "bg"],
    ["em", "bg"],
    ["btnfg", "btn"],
    ["btn2fg", "btn2"],
    ["on", "brand"],
    ["on", "deep"],
    ["goldtext", "card"],
    ["goldlight", "deep"],
    ["up", "bg"],
  ];
  for (const mode of ["light", "dark"] as const) {
    it(`default ${mode} colours are readable (AA)`, () => {
      const t = shopTokens(DEFAULT_COLORS, mode) as Record<string, string>;
      for (const [fg, bg] of pairs) {
        expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg} (${mode})`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("builds the theme style with light, dark and follow-the-device blocks", () => {
    const css = themeCss(DEFAULT_COLORS);
    expect(css).toContain(":root{--s-bg:#f5ede0;");
    expect(css).toContain('html[data-area="shop"]{--background:#f5ede0;');
    expect(css).toContain('html[data-area="shop"][data-mode="dark"]{');
    expect(css).toContain(
      '@media (prefers-color-scheme: dark){html[data-area="shop"][data-mode="system"]{',
    );
    expect(css).not.toContain("undefined");
  });

  it("refuses anything but #rrggbb (the colours go into a <style> tag)", () => {
    expect(() => themeCss({ ...DEFAULT_COLORS, bg: "red;}</style><script>" })).toThrow();
    expect(() => themeCss({ ...DEFAULT_COLORS, gold: "#fff" })).toThrow();
  });

  it("reads the light/dark cookie", () => {
    expect(parseMode("dark")).toBe("dark");
    expect(parseMode("system")).toBe("system");
    expect(parseMode("blue")).toBeNull();
    expect(parseMode(undefined)).toBeNull();
  });
});
