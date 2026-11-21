import { DEFAULT_COLORS, type ColorMode, type ThemeColors } from "@/lib/theme";

/**
 * Festival themes (Admin → Appearance). One "Everyday" theme is always on; a dated theme (Diwali,
 * wedding season…) takes over between its dates, in India time, with no deploy. If two dated
 * themes overlap, the one that started later wins. Pure: shared by server and admin screens.
 */

export const DECORATIONS = [
  { value: "none", label: "None" },
  { value: "toran", label: "Marigold toran under the header" },
  { value: "petals", label: "Scattered petals behind the top of the home page" },
] as const;
export type Decoration = (typeof DECORATIONS)[number]["value"];

export type HeroLayout = "arch" | "video";

export interface ThemeHero {
  /** "arch" = text beside a photo in an arch; "video" = full-width background video. */
  layout: HeroLayout;
  /** Photo for the arch, and the still shown before (or instead of) the video. */
  image: string;
  imageAlt: string;
  /** .mp4/.webm on our Cloudinary or R2; "" = none. */
  video: string;
  /** Small line above the heading. */
  eyebrow: string;
  /** *Stars* around words show them in italics. */
  heading: string;
  text: string;
  cta: string;
  /** A page on this site, e.g. /products?occasion=festive */
  ctaHref: string;
  /** Two lines over the bottom of the arch photo. */
  captionSmall: string;
  captionBig: string;
}

export interface Theme {
  id: string;
  name: string;
  /** The always-on theme (exactly one). It has no dates. */
  isDefault: boolean;
  /** YYYY-MM-DD, both inclusive, India time. "" on the default theme. */
  from: string;
  until: string;
  colors: ThemeColors;
  decor: Decoration;
  hero: ThemeHero;
  /** Shown in the bar above the header while this theme is live, when no announcement is. */
  offer: string;
}

export interface Appearance {
  /** Light/dark for shoppers who haven't pressed the sun/moon button. */
  defaultMode: ColorMode;
  themes: Theme[];
}

export const DEFAULT_HERO: ThemeHero = {
  layout: "arch",
  image: "/images/editorial/kundan-necklace.jpg",
  imageAlt: "Kundan necklace with matching jhumka earrings",
  video: "",
  eyebrow: "Timeless by nature",
  heading: "Gold for the moments that become *forever.*",
  text: "Temple, kundan and diamond pieces in hallmarked gold and sterling silver. Bought online, delivered insured, kept for generations.",
  cta: "Browse jewellery",
  ctaHref: "/products",
  captionSmall: "The art of every detail",
  captionBig: "Kundan heritage",
};

export const EVERYDAY_THEME: Theme = {
  id: "everyday",
  name: "Everyday",
  isDefault: true,
  from: "",
  until: "",
  colors: DEFAULT_COLORS,
  decor: "none",
  hero: DEFAULT_HERO,
  offer: "",
};

export const DEFAULT_APPEARANCE: Appearance = {
  defaultMode: "system",
  themes: [EVERYDAY_THEME],
};

/** Starting points for "Add a theme". Admins change anything before saving. */
export const THEME_PRESETS: { key: string; label: string; theme: Omit<Theme, "id"> }[] = [
  {
    key: "diwali",
    label: "Diwali",
    theme: {
      name: "Diwali",
      isDefault: false,
      from: "",
      until: "",
      colors: {
        brand: "#7c2113",
        gold: "#d9a21b",
        bg: "#f8ead6",
        alt: "#fdf5e8",
        ink: "#2a1a0e",
        muted: "#7a5a3e",
        festive: "#e8891c",
      },
      decor: "toran",
      hero: {
        ...DEFAULT_HERO,
        image: "/images/editorial/bangles.jpg",
        imageAlt: "A pair of kundan bangles with ruby and green stones",
        eyebrow: "Diwali · The festive edit",
        heading: "This Diwali, bring home *gold.*",
        text: "Festive necklaces, jhumkas and coins, all priced at today's gold rate.",
        cta: "Shop the festive edit",
        ctaHref: "/products?occasion=festive",
        captionSmall: "The festive edit",
        captionBig: "Kundan bangles",
      },
      offer: "",
    },
  },
  {
    key: "wedding",
    label: "Wedding season",
    theme: {
      name: "Wedding season",
      isDefault: false,
      from: "",
      until: "",
      colors: {
        brand: "#8a2846",
        gold: "#bf8f35",
        bg: "#f6e9e6",
        alt: "#fcf5f3",
        ink: "#2e1d22",
        muted: "#7d5c66",
        festive: "#d98aa0",
      },
      decor: "petals",
      hero: {
        ...DEFAULT_HERO,
        image: "/images/editorial/bridal-set.jpg",
        imageAlt: "Gold bridal necklace and earrings on red silk",
        eyebrow: "The wedding edit",
        heading: "For all your *forevers.*",
        text: "Bridal sets, mangalsutras and gifts for the season. Book a private showroom visit for the family.",
        cta: "Shop bridal",
        ctaHref: "/products?occasion=bridal",
        captionSmall: "The wedding edit",
        captionBig: "Bridal gold",
      },
      offer: "*Wedding season:* book a private bridal appointment at the showroom",
    },
  },
  {
    key: "blank",
    label: "Blank (copy of Everyday)",
    theme: { ...EVERYDAY_THEME, name: "New theme", isDefault: false },
  },
];

const indiaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in India as YYYY-MM-DD. */
export function todayInIndia(now = new Date()): string {
  return indiaDate.format(now);
}

/** The theme customers see today. */
export function liveTheme(appearance: Appearance, today: string): Theme {
  const live = appearance.themes
    .filter((t) => !t.isDefault && t.from && t.until && t.from <= today && today <= t.until)
    .sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
  return live[0] ?? appearance.themes.find((t) => t.isDefault) ?? EVERYDAY_THEME;
}

/** "overlapped" = within its dates, but another theme that started later is showing. */
export type ThemeStatus = "default" | "live" | "upcoming" | "ended" | "off" | "overlapped";

/** For the admin list: is a theme showing now, later, or never again? */
export function themeStatus(theme: Theme, appearance: Appearance, today: string): ThemeStatus {
  if (theme.isDefault) return "default";
  if (!theme.from || !theme.until) return "off";
  if (theme.until < today) return "ended";
  if (theme.from > today) return "upcoming";
  return liveTheme(appearance, today).id === theme.id ? "live" : "overlapped";
}

/** "Gold for the *forever*" → parts, odd ones italic. */
export function emphasisParts(text: string): string[] {
  return text.split(/\*([^*]+)\*/g);
}
