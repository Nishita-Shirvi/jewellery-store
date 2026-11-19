import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseCsv, csvRecords, csvRow } = await import("@/lib/report/csv");
const { placeOfSupply, GST_STATE_CODES } = await import("@/lib/india");
const recon = await import("@/services/recon.service");
const integ = await import("@/services/integrations.service");
const gst = await import("@/services/gst-report.service");

describe("parseCsv", () => {
  it("handles quotes, embedded commas, newlines, doubled quotes, BOM and CRLF", () => {
    const text = '﻿a,b,c\r\n"x, y","line1\nline2","say ""hi"""\r\n1,,3\r\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", "line1\nline2", 'say "hi"'],
      ["1", "", "3"],
    ]);
  });
  it("round-trips what csvRow writes", () => {
    const row = ["plain", "with,comma", 'with "quote"', "multi\nline"];
    expect(parseCsv(csvRow(row))).toEqual([row]);
  });
  it("csvRecords keys by lower-case header, skips blank lines, reports line numbers", () => {
    const rec = csvRecords("Slug,Name\nring-1,Ring\n\nring-2,Band\n");
    expect(rec.map((r) => r.values.slug)).toEqual(["ring-1", "ring-2"]);
    expect(rec[0]!.values.name).toBe("Ring");
    expect(rec[0]!.line).toBe(2);
  });
});

describe("GST place of supply", () => {
  it("formats state code and name", () => {
    expect(placeOfSupply("Telangana")).toBe("36-Telangana");
    expect(GST_STATE_CODES.Maharashtra).toBe("27");
    expect(GST_STATE_CODES.Karnataka).toBe("29");
  });
  it("month range is India-time midnight to midnight", () => {
    const { from, to } = gst.monthRange("2026-12");
    expect(from.toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(to.toISOString()).toBe("2026-12-31T18:30:00.000Z");
    expect(() => gst.monthRange("2026-13")).toThrow();
    expect(() => gst.monthRange("nov")).toThrow();
  });
});

describe("reconciliation parsing", () => {
  it("rupeesToPaise accepts ₹, commas and spaces; rejects junk", () => {
    expect(recon.rupeesToPaise("₹1,500.50")).toBe(150050);
    expect(recon.rupeesToPaise(" 12 ")).toBe(1200);
    expect(recon.rupeesToPaise("abc")).toBeNull();
    expect(recon.rupeesToPaise("1.234")).toBeNull();
    expect(recon.rupeesToPaise(undefined)).toBeNull();
  });
  it("parses a Razorpay settlement report (fee + tax as fees)", () => {
    const lines = recon.parseSettlementCsv(
      "entity_id,type,amount,fee,tax,created_at\npay_1,payment,1500.00,30.00,5.40,2026-11-01 10:00:00\nrfnd_1,refund,-200,0,0,\n",
    );
    expect(lines[0]).toMatchObject({
      entityId: "pay_1",
      type: "payment",
      amountInPaise: 150000,
      feeInPaise: 3540,
    });
    expect(lines[1]).toMatchObject({
      entityId: "rfnd_1",
      type: "refund",
      amountInPaise: 20000,
      createdAt: null,
    });
  });
  it("rejects a file that isn't a settlement report", () => {
    expect(() => recon.parseSettlementCsv("awb,amount\n1,2\n")).toThrow(/settlement report/);
    expect(() => recon.parseSettlementCsv("entity_id,amount\npay_1,lots\n")).toThrow(/Line 2/);
  });
  it("parses a COD remittance sheet with different header spellings", () => {
    expect(recon.parseRemittanceCsv('AWB Number,COD Amount\nAWB1,"2,499.00"\n')).toEqual([
      { ref: "AWB1", amountInPaise: 249900, line: 2 },
    ]);
    expect(() => recon.parseRemittanceCsv("awb,amount\n,10\n")).toThrow(/Line 2/);
  });
});

describe("webhook safety and signing", () => {
  it("only allows public https URLs", () => {
    expect(integ.safeWebhookUrl("https://hooks.example.com/x")).toBe("https://hooks.example.com/x");
    for (const bad of [
      "http://hooks.example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://192.168.1.1/x",
      "https://172.16.0.1/x",
      "https://169.254.169.254/latest",
      "https://[::1]/x",
      "https://user:pw@example.com/x",
      "https://db.internal/x",
      "not a url",
    ])
      expect(integ.safeWebhookUrl(bad), bad).toBeNull();
    expect(integ.safeWebhookUrl("https://172.32.0.1/x")).not.toBeNull();
  });
  it("signature is HMAC-SHA256 of t.body", () => {
    const sig = integ.signWebhook("whsec_test", '{"a":1}', 1700000000);
    const expected = createHmac("sha256", "whsec_test").update('1700000000.{"a":1}').digest("hex");
    expect(sig).toBe(`t=1700000000,v1=${expected}`);
  });
});
