/**
 * The shop popup (Admin → Appearance → Popup): a picture, a few words and one thing to do —
 * book a private viewing, join the newsletter, sign in, or open a page. Off until an admin turns
 * it on. Pure: shared by the shop, admin and tests.
 */

export const POPUP_ACTIONS = [
  { value: "visit", label: "Book a showroom visit (name, mobile, day and time)" },
  { value: "news", label: "Join the newsletter (email)" },
  { value: "signin", label: "Sign in or create an account" },
  { value: "link", label: "Just a button to a page" },
] as const;
export type PopupAction = (typeof POPUP_ACTIONS)[number]["value"];

export const POPUP_DELAYS = [
  { value: "4", label: "After 4 seconds" },
  { value: "8", label: "After 8 seconds" },
  { value: "20", label: "After 20 seconds" },
  { value: "exit", label: "When they're about to leave (computers; phones after 20 seconds)" },
] as const;
export type PopupDelay = (typeof POPUP_DELAYS)[number]["value"];

export const POPUP_AGAIN = [
  { value: 1, label: "Once a day" },
  { value: 7, label: "Once a week" },
  { value: 30, label: "Once a month" },
  { value: 0, label: "Only once" },
] as const;

export interface PopupSettings {
  on: boolean;
  /** YYYY-MM-DD, India time, both included. "" = no limit. */
  from: string;
  until: string;
  image: string;
  imageAlt: string;
  eyebrow: string;
  /** *Stars* show words in italics. */
  heading: string;
  text: string;
  action: PopupAction;
  /** Button label. */
  cta: string;
  /** For "link": a page on this site. */
  link: string;
  delay: PopupDelay;
  /** Days before the same shopper sees it again; 0 = only once. */
  againDays: number;
  /** "home" = home page only; "all" = every shop page except cart, checkout and account pages. */
  where: "home" | "all";
  /** Changes on every save, so a new popup shows even to shoppers who closed the last one. */
  version: string;
}

export const DEFAULT_POPUP: PopupSettings = {
  on: false,
  from: "",
  until: "",
  image: "/images/editorial/bridal-set.jpg",
  imageAlt: "Gold bridal necklace and earrings on red silk",
  eyebrow: "By appointment",
  heading: "A private *viewing,* just for your family.",
  text: "Pick a day and we'll keep your shortlist ready at the showroom, with chai and no rush.",
  action: "visit",
  cta: "Request my viewing",
  link: "/visit",
  delay: "8",
  againDays: 7,
  where: "home",
  version: "default",
};

/** Is it switched on and within its dates today (India date)? */
export function popupLive(p: PopupSettings, today: string): boolean {
  if (!p.on) return false;
  if (p.from && today < p.from) return false;
  if (p.until && today > p.until) return false;
  return true;
}

/** Pages where the popup never interrupts: buying, signing in, account and admin. */
export function popupAllowedOn(pathname: string, where: PopupSettings["where"]): boolean {
  if (where === "home") return pathname === "/";
  return !/^\/(admin|staff|checkout|cart|account|orders|login|register|forgot-password|reset-password|unsubscribe|newsletter)(\/|$)/.test(
    pathname,
  );
}

/** Should a shopper who last closed it at `seenAt` (ms) for `version` see it again now? */
export function popupDue(
  seen: { at: number; version: string } | null,
  p: Pick<PopupSettings, "againDays" | "version">,
  now = Date.now(),
): boolean {
  if (!seen || seen.version !== p.version) return true;
  if (p.againDays === 0) return false;
  return now - seen.at >= p.againDays * 86_400_000;
}

const dayLabel = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** The next `count` days after `today` (YYYY-MM-DD), for the visit day buttons. */
export function visitDays(today: string, count = 5): { value: string; label: string }[] {
  const start = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getTime() + (i + 1) * 86_400_000);
    return { value: d.toISOString().slice(0, 10), label: dayLabel.format(d) };
  });
}
