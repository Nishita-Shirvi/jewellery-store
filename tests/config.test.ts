import { readFileSync, readdirSync } from "node:fs";
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

  it("the committed config/*.ini files are valid", () => {
    const files = Object.fromEntries(
      readdirSync("config")
        .filter((n) => n.endsWith(".ini"))
        .map((n) => [`config/${n}`, readFileSync(`config/${n}`, "utf8")]),
    );
    expect(Object.keys(files).length).toBeGreaterThanOrEqual(7);
    const c = buildConfig(files, {});
    expect(c.invoice.prefix).toBe("INV");
    expect(c.business.state).toBe("Telangana");
    expect(c.returns.window_days).toBe(7);
    expect(c.pricing.strip_purities).toEqual(["K22", "K24"]);
    expect(c.images.provider).toBe("cloudinary");
    expect(c.features.visit_booking).toBe(true);
  });

  it("refuses a section defined in two files", () => {
    expect(() =>
      buildConfig(
        { "a.ini": "[shipping]\nfee_rupees = 1\n", "b.ini": "[shipping]\nfee_rupees = 2\n" },
        {},
      ),
    ).toThrow(/\[shipping\] is defined in both a.ini and b.ini/);
  });

  it("refuses misspelt sections and keys", () => {
    expect(() => buildConfig("[shiping]\nfee_rupees = 1\n", {})).toThrow(/\[shiping\]/);
    expect(() => buildConfig("[shipping]\nfee_rupee = 1\n", {})).toThrow(/fee_rupee is not/);
  });

  it("ignores comments after a value unless quoted", () => {
    const c = buildConfig(
      '[business]\nlegal_name = Acme Pvt Ltd ; registered\n[storefront]\nannouncement = "Sale; today"\n',
      {},
    );
    expect(c.business.legal_name).toBe("Acme Pvt Ltd");
    expect(c.storefront.announcement).toBe("Sale; today");
  });

  it("validates the R2 public URL and rate strip purities", () => {
    expect(() => buildConfig("[images]\nr2_public_url = http://x.dev\n", {})).toThrow(/images/);
    expect(() => buildConfig("[pricing]\nstrip_purities = K22,K99\n", {})).toThrow(/pricing/);
  });
});
