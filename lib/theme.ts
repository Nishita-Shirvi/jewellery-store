/**
 * Shop colours (customer pages only; admin keeps its own look). Everything is worked out from a
 * handful of base colours, so a festival theme only has to pick seven colours and both light and
 * dark mode follow. Pure functions, safe on server and client.
 */

export interface ThemeColors {
  /** Main colour: header, buttons, headings (Vineet maroon by default). */
  brand: string;
  gold: string;
  /** Page background (light mode). */
  bg: string;
  /** Second background for alternate bands and the rate bar (light mode). */
  alt: string;
  /** Body text (light mode). */
  ink: string;
  /** Secondary text (light mode). */
  muted: string;
  /** Festive accent for decorations (toran flowers, petals). */
  festive: string;
}

export const DEFAULT_COLORS: ThemeColors = {
  brand: "#6b1f2a",
  gold: "#c9a227",
  bg: "#f5ede0",
  alt: "#faf6ee",
  ink: "#2b2118",
  muted: "#765b50",
  festive: "#c9a227",
};

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Light/dark preference: "system" follows the phone or computer setting. */
export type ColorMode = "system" | "light" | "dark";
export const COLOR_MODES: readonly ColorMode[] = ["system", "light", "dark"];
/** Cookie that remembers a shopper's choice from the sun/moon button. */
export const MODE_COOKIE = "vj_mode";

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blends colour a towards b by t (0 = a, 1 = b). Both must be #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) =>
    Math.round(v * (1 - t) + B[i]! * t)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
}

/** WCAG 2 contrast ratio between two #rrggbb colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The shop's design tokens (CSS custom property name without "--s-" → colour). */
export function shopTokens(c: ThemeColors, mode: "light" | "dark") {
  const deep = mix(c.brand, "#000000", 0.32);
  if (mode === "light") {
    return {
      bg: c.bg,
      alt: c.alt,
      card: mix(c.alt, "#ffffff", 0.5),
      ink: c.ink,
      muted: c.muted,
      head: deep,
      em: c.brand,
      eyebrow: c.brand,
      brand: c.brand,
      deep,
      on: "#f8f1e6",
      wordmark: mix(c.gold, "#ffffff", 0.45),
      gold: c.gold,
      goldtext: mix(c.gold, "#000000", 0.4),
      goldlight: mix(c.gold, "#ffffff", 0.3),
      btn: c.brand,
      btnfg: "#fbf6ee",
      btn2: "#faf6ee",
      btn2fg: deep,
      line: mix(c.bg, c.brand, 0.14),
      field: mix(mix(c.bg, c.brand, 0.14), c.ink, 0.2),
      subtle: mix(c.bg, c.ink, 0.07),
      icon: mix(c.gold, "#000000", 0.18),
      festive: c.festive,
      leaf: "#3d6b35",
      up: "#2f7a43",
      tile: mix(c.alt, "#ffffff", 0.55),
      "m-hi": mix(c.brand, "#ffffff", 0.14),
      "m-deep": deep,
      "m-shade": mix(c.brand, "#000000", 0.62),
      "m-hair": mix(c.brand, "#000000", 0.8),
      "m-rim": mix(c.gold, deep, 0.55),
    };
  }
  const bg = mix(c.brand, "#0c090a", 0.9);
  const ink = "#efe6da";
  const line = mix(bg, c.gold, 0.2);
  return {
    bg,
    alt: mix(c.brand, "#0c090a", 0.84),
    card: mix(c.brand, "#0c090a", 0.8),
    ink,
    muted: "#b4a89d",
    head: "#f4e9d6",
    em: mix(c.gold, "#ffffff", 0.22),
    eyebrow: mix(c.gold, "#ffffff", 0.18),
    brand: mix(c.brand, "#000000", 0.55),
    deep: mix(c.brand, "#000000", 0.7),
    on: "#f1e7d8",
    wordmark: mix(c.gold, "#ffffff", 0.4),
    gold: c.gold,
    goldtext: mix(c.gold, "#ffffff", 0.22),
    goldlight: mix(c.gold, "#ffffff", 0.3),
    btn: c.gold,
    btnfg: "#1a1011",
    btn2: c.gold,
    btn2fg: "#1a1011",
    line,
    field: mix(line, ink, 0.15),
    subtle: mix(bg, ink, 0.08),
    icon: mix(c.gold, "#ffffff", 0.3),
    festive: c.festive,
    leaf: "#77a865",
    up: "#74c991",
    tile: mix(c.brand, "#0c090a", 0.87),
    "m-hi": mix(c.brand, "#ffffff", 0.16),
    "m-deep": mix(c.brand, "#000000", 0.22),
    "m-shade": mix(c.brand, "#000000", 0.62),
    "m-hair": mix(c.brand, "#000000", 0.82),
    "m-rim": mix(c.gold, "#000000", 0.15),
  };
}

/** The general page colours every component uses (bg-background, text-primary…), per mode. */
function uiTokens(s: ReturnType<typeof shopTokens>): Record<string, string> {
  return {
    background: s.bg,
    foreground: s.ink,
    muted: s.subtle,
    "muted-foreground": s.muted,
    accent: s.alt,
    "accent-foreground": s.ink,
    primary: s.btn,
    "primary-foreground": s.btnfg,
    gold: s.icon,
    border: s.line,
    input: s.field,
    ring: s.gold,
  };
}

/**
 * Dark mode: the status colours used for messages (red / green / amber text and pale message
 * boxes) are lightened so they stay readable on the dark background.
 */
const DARK_STATUS =
  "--color-red-50:rgb(239 68 68/.14);--color-red-200:rgb(248 113 113/.45);--color-red-600:#f87171;" +
  "--color-red-700:#fca5a5;--color-red-800:#fecaca;" +
  "--color-emerald-50:rgb(16 185 129/.14);--color-emerald-200:rgb(52 211 153/.45);" +
  "--color-emerald-700:#6ee7b7;--color-emerald-800:#a7f3d0;--color-emerald-900:#d1fae5;" +
  "--color-amber-50:rgb(245 158 11/.14);--color-amber-200:rgb(251 191 36/.45);" +
  "--color-amber-300:rgb(251 191 36/.55);--color-amber-700:#fcd34d;--color-amber-800:#fde68a;" +
  "--color-amber-900:#fef3c7;--color-amber-950:#fffbeb;";

function declarations(tokens: Record<string, string>, prefix: string): string {
  return Object.entries(tokens)
    .map(([k, v]) => `${prefix}${k}:${v};`)
    .join("");
}

/**
 * The <style> for the shop: --s-* tokens for everyone (the header and footer also show on admin
 * pages), and the general page colours plus dark mode only where <html data-area="shop">.
 * Dark mode applies with data-mode="dark", or data-mode="system" on a device set to dark.
 * Colours must already be validated #rrggbb values (they go into a <style> tag).
 */
export function themeCss(c: ThemeColors): string {
  for (const v of Object.values(c)) {
    if (!HEX_COLOR.test(v)) throw new Error(`Invalid theme colour: ${v}`);
  }
  const light = shopTokens(c, "light");
  const dark = shopTokens(c, "dark");
  const darkBlock =
    declarations(dark, "--s-") +
    declarations(uiTokens(dark), "--") +
    DARK_STATUS +
    "color-scheme:dark;";
  return (
    `:root{${declarations(light, "--s-")}}` +
    `html[data-area="shop"]{${declarations(uiTokens(light), "--")}color-scheme:light;}` +
    `html[data-area="shop"][data-mode="dark"]{${darkBlock}}` +
    `@media (prefers-color-scheme: dark){html[data-area="shop"][data-mode="system"]{${darkBlock}}}`
  );
}

export function parseMode(value: string | undefined | null): ColorMode | null {
  return value === "light" || value === "dark" || value === "system" ? value : null;
}
