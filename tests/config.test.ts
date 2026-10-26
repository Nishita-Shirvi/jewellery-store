import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildConfig, envOverrides, parseIni } from "@/lib/config";

describe("config.ini", () => {
  it("parses sections, comments and quoted values", () => {
    const raw = parseIni(
      `; comment\n# also comment\n[business]\nlegal_name = "Acme Jewels"\n\n[shipping]\nfee_rupees=50\n`,
    );
    expect(raw).toEqual({
      business: { legal_name: "Acme Jewels" },
      shipping: { fee_rupees: "50" },
    });
  });

  it("rejects a key outside any section", () => {
    expect(() => parseIni("fee_rupees = 10")).toThrow(/line 1/);
  });

  it("uses defaults for missing and empty values", () => {
    const c = buildConfig("[shipping]\nfee_rupees =\n", {});
    expect(c.shipping).toEqual({ fee_rupees: 99, free_above_rupees: 999 });
    expect(c.inventory.reservation_minutes).toBe(15);
    expect(c.alerts.admin_email).toBeUndefined();
    expect(c.logging.level).toBe("info");
  });

  it("env var SECTION_KEY overrides the file, and legacy names still work", () => {
    const c = buildConfig("[shipping]\nfee_rupees = 99\n[features]\nsms = false\n", {
      SHIPPING_FEE_RUPEES: "0",
      FREE_SHIPPING_ABOVE_RUPEES: "5000",
      FEATURE_SMS: "true",
      LOG_LEVEL: "debug",
    });
    expect(c.shipping).toEqual({ fee_rupees: 0, free_above_rupees: 5000 });
    expect(c.features.sms).toBe(true);
    expect(c.logging.level).toBe("debug");
  });

  it("lists which env vars override the file", () => {
    expect(
      envOverrides({ BUSINESS_GSTIN: "X", FEATURE_SMS: "true", UNRELATED: "1", LOG_LEVEL: "" }),
    ).toEqual(["BUSINESS_GSTIN", "FEATURE_SMS"]);
  });

  it("stops with a readable message on a bad value", () => {
    expect(() => buildConfig("[invoice]\nprefix = inv/\n", {})).toThrow(/\[invoice\] prefix/);
    expect(() => buildConfig("[business]\nstate = Telengana\n", {})).toThrow(/\[business\] state/);
  });

  it("the committed config.ini is valid", () => {
    const c = buildConfig(readFileSync("config.ini", "utf8"), {});
    expect(c.invoice.prefix).toBe("INV");
    expect(c.business.state).toBe("Telangana");
  });
});
