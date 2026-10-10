/** Formatting helpers shared by server and client code. */

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const inrWithPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * 6850000 paise → "₹68,500"; 875050 → "₹8,750.50". Never rounds away paise.
 * Money is always stored in paise (integers).
 */
export function formatINR(paise: number): string {
  const value = Math.round(paise);
  return (value % 100 === 0 ? inrWhole : inrWithPaise).format(value / 100);
}

/** 4125 mg → "4.13 g". Weights are always stored in milligrams (integers). */
export function formatWeight(milligrams: number): string {
  const grams = milligrams / 1000;
  return `${Number.isInteger(grams) ? grams : grams.toFixed(2).replace(/0$/, "")} g`;
}
