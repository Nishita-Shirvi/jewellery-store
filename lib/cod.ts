/**
 * Cash-on-delivery rules (Phase 18). Pure functions — no database — so every rule is unit-tested.
 * Settings come from config.ini [cod].
 */

export interface CodRules {
  enabled: boolean;
  maxOrderInPaise: number;
  feeInPaise: number;
  /** Pincodes or prefixes; empty = everywhere. */
  pincodes: string[];
  maxRefusals: number;
  otpRequired: boolean;
}

export interface CodContext {
  /** Order total WITHOUT the COD fee (items − discount + shipping). */
  totalBeforeFeeInPaise: number;
  pincode: string;
  /** Refused COD parcels on this customer's record. */
  refusals: number;
  /** Can a one-time code be sent right now (SMS set up, or development)? */
  otpAvailable: boolean;
  /** Courier can collect cash at this pincode: true / false, null = unknown (Shiprocket off). */
  courierCod: boolean | null;
}

export type CodDecision =
  { ok: true; feeInPaise: number; totalInPaise: number } | { ok: false; reason: string };

export function parsePincodeList(raw: string): string[] {
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^\d{1,6}$/.test(p));
}

export function pincodeAllowed(pincode: string, list: string[]): boolean {
  if (list.length === 0) return true;
  return list.some((prefix) => pincode.startsWith(prefix));
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/** Can this order be paid in cash on delivery? The first failing rule gives the reason shown. */
export function codDecision(rules: CodRules, ctx: CodContext): CodDecision {
  if (!rules.enabled) return { ok: false, reason: "Cash on delivery isn't offered right now." };
  if (rules.otpRequired && !ctx.otpAvailable)
    return { ok: false, reason: "Cash on delivery isn't available yet." };
  if (ctx.refusals >= rules.maxRefusals)
    return {
      ok: false,
      reason:
        "Cash on delivery isn't available on this account because earlier COD parcels were refused. Please pay online.",
    };
  if (!/^\d{6}$/.test(ctx.pincode) || !pincodeAllowed(ctx.pincode, rules.pincodes))
    return { ok: false, reason: `Cash on delivery isn't available at pincode ${ctx.pincode}.` };
  if (ctx.courierCod === false)
    return { ok: false, reason: `Couriers can't collect cash at pincode ${ctx.pincode}.` };
  const total = ctx.totalBeforeFeeInPaise + rules.feeInPaise;
  if (total > rules.maxOrderInPaise)
    return {
      ok: false,
      reason: `Cash on delivery is available for orders up to ${rupees(rules.maxOrderInPaise)}. Please pay online.`,
    };
  return { ok: true, feeInPaise: rules.feeInPaise, totalInPaise: total };
}

/** 10-digit Indian mobile, from "+91 98765 43210", "09876543210", "9876543210". */
export function normaliseMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten =
    digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

/** "98•••••210" — enough for the customer to recognise their number. */
export function maskMobile(mobile: string): string {
  return mobile.length === 10 ? `${mobile.slice(0, 2)}•••••${mobile.slice(7)}` : "your mobile";
}
