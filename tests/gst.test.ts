import { describe, expect, it } from "vitest";
import {
  amountInWords,
  financialYear,
  formatInvoiceNumber,
  formatRate,
  isIntraState,
  parseRatePercent,
  splitInclusive,
  taxForLine,
} from "@/lib/gst";

describe("GST extraction from inclusive prices", () => {
  it("3% on ₹1,03,000 → taxable ₹1,00,000 + tax ₹3,000", () => {
    expect(splitInclusive(1_03_000_00, 300)).toEqual({ taxable: 1_00_000_00, tax: 3_000_00 });
  });
  it("always adds back up exactly", () => {
    for (const total of [1, 99, 195_000, 6_850_000, 29_500_000, 875_050]) {
      for (const rate of [0, 25, 300, 500, 1800]) {
        const { taxable, tax } = splitInclusive(total, rate);
        expect(taxable + tax).toBe(total);
      }
    }
  });
  it("same state → CGST + SGST that add up to the tax (odd paisa goes to SGST)", () => {
    const t = taxForLine(195_000, 300, true); // ₹1,950
    expect(t.cgstInPaise + t.sgstInPaise + t.taxableInPaise).toBe(195_000);
    expect(t.igstInPaise).toBe(0);
    expect(t.sgstInPaise - t.cgstInPaise).toBeLessThanOrEqual(1);
  });
  it("other state → IGST only", () => {
    const t = taxForLine(6_850_000, 300, false);
    expect(t).toEqual({
      taxableInPaise: 6_650_485,
      cgstInPaise: 0,
      sgstInPaise: 0,
      igstInPaise: 199_515,
    });
  });
  it("compares states case-insensitively", () =>
    expect(isIntraState("Telangana", " telangana ")).toBe(true));
});

describe("invoice numbering", () => {
  it("uses the Indian financial year in India time", () => {
    expect(financialYear(new Date("2026-03-31T18:00:00Z"))).toBe("2025-26"); // 31 Mar 23:30 IST
    expect(financialYear(new Date("2026-03-31T18:31:00Z"))).toBe("2026-27"); // 1 Apr 00:01 IST
    expect(financialYear(new Date("2026-10-10T10:00:00Z"))).toBe("2026-27");
  });
  it("pads the sequence", () =>
    expect(formatInvoiceNumber("INV", "2026-27", 42)).toBe("INV/2026-27/000042"));
});

describe("rates", () => {
  it("formats and parses", () => {
    expect(formatRate(300)).toBe("3%");
    expect(formatRate(25)).toBe("0.25%");
    expect(parseRatePercent("3")).toBe(300);
    expect(parseRatePercent("0.25")).toBe(25);
    expect(parseRatePercent("18%")).toBe(1800);
    expect(parseRatePercent("40")).toBeNull();
    expect(parseRatePercent("abc")).toBeNull();
  });
});

describe("amountInWords (Indian system)", () => {
  it.each([
    [29_500_000, "Rupees Two Lakh Ninety Five Thousand Only"],
    [875_050, "Rupees Eight Thousand Seven Hundred Fifty and Fifty Paise Only"],
    [
      1_23_45_678_00,
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only",
    ],
    [19_00, "Rupees Nineteen Only"],
  ])("%d paise", (p, words) => expect(amountInWords(p)).toBe(words));
});
