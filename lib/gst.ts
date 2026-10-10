/**
 * GST maths (pure, unit-tested). All prices on the store INCLUDE GST, so tax is extracted:
 *   taxable = price × 10000 / (10000 + rateBps), tax = price − taxable.
 * Rates are basis points (300 = 3%). Amounts are integer paise; rounding to the nearest paisa.
 * Same state as the seller → half CGST + half SGST; different state → IGST.
 */

export interface LineTax {
  taxableInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
}

export function splitInclusive(
  totalInPaise: number,
  rateBps: number,
): { taxable: number; tax: number } {
  const taxable = Math.round((totalInPaise * 10000) / (10000 + rateBps));
  return { taxable, tax: totalInPaise - taxable };
}

export function taxForLine(totalInPaise: number, rateBps: number, intraState: boolean): LineTax {
  const { taxable, tax } = splitInclusive(totalInPaise, rateBps);
  if (!intraState)
    return { taxableInPaise: taxable, cgstInPaise: 0, sgstInPaise: 0, igstInPaise: tax };
  const cgst = Math.floor(tax / 2);
  return { taxableInPaise: taxable, cgstInPaise: cgst, sgstInPaise: tax - cgst, igstInPaise: 0 };
}

export function isIntraState(sellerState: string, buyerState: string): boolean {
  return sellerState.trim().toLowerCase() === buyerState.trim().toLowerCase();
}

/** Indian financial year (April–March) in India time, e.g. "2026-27". */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function formatInvoiceNumber(prefix: string, fy: string, sequence: number): string {
  return `${prefix}/${fy}/${String(sequence).padStart(6, "0")}`;
}

/** "3%" from 300; "0.25%" from 25. */
export function formatRate(rateBps: number): string {
  return `${(rateBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** "3", "0.25", "18" (percent text from an admin form) → basis points, or null. */
export function parseRatePercent(input: string): number | null {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/%$/, ""));
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return bps <= 2800 ? bps : null;
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? belowHundred(r) : ""].filter(Boolean).join(" ");
}

/** Indian numbering in words: 295000 paise… e.g. 2,95,000.50 → "Rupees Two Lakh Ninety Five Thousand and Fifty Paise Only". */
export function amountInWords(paise: number): string {
  let rupees = Math.floor(paise / 100);
  const p = paise % 100;
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000);
  rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rupees) parts.push(belowThousand(rupees));
  const words = parts.join(" ") || "Zero";
  return `Rupees ${words}${p ? ` and ${belowHundred(p)} Paise` : ""} Only`;
}
