/**
 * Exact conversions between what admins type and what we store, using string maths
 * (never floating point): rupees → paise, grams → milligrams.
 */

/** "68,500" → 6850000, "1999.5" → 199950, "₹ 1,999.50" → 199950. Returns null if invalid. */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[1]);
  const paise = Number((match[2] ?? "").padEnd(2, "0") || "0");
  return rupees * 100 + paise;
}

/** 6850000 → "68500", 199950 → "1999.50" (for filling forms). */
export function paiseToRupeesInput(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}

/** "4.125" → 4125, "28" → 28000. Returns null if invalid (max 3 decimals). */
export function parseGramsToMg(input: string): number | null {
  const cleaned = input.replace(/\s|g$/gi, "");
  const match = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(cleaned);
  if (!match) return null;
  return Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0") || "0");
}

/** 4125 → "4.125", 28000 → "28". */
export function mgToGramsInput(mg: number): string {
  const grams = Math.trunc(mg / 1000);
  const rest = mg % 1000;
  return rest === 0
    ? String(grams)
    : `${grams}.${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}
