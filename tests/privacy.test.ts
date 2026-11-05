import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const keys = vi.hoisted(() => ({
  AUTH_SECRET: "auth-secret-for-unit-tests-0123456789abcdef",
  PII_ENCRYPTION_KEY: undefined as string | undefined,
  PII_PREVIOUS_KEY: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({ env: keys }));

import {
  decryptAddress,
  decryptPii,
  encryptAddress,
  encryptPii,
  isEncrypted,
  needsReencrypt,
} from "@/lib/pii";

/** Phase 27 — field-level encryption of phone numbers and addresses. */

describe("encrypting phone numbers and addresses", () => {
  it("round-trips, and two encryptions of the same value differ (random IV)", () => {
    const a = encryptPii("9876543210");
    const b = encryptPii("9876543210");
    expect(a).toMatch(/^pii:v1:/);
    expect(a).not.toContain("9876543210");
    expect(a).not.toBe(b);
    expect(decryptPii(a)).toBe("9876543210");
  });

  it("never wraps twice; empty and missing values stay as they are", () => {
    const once = encryptPii("12 MG Road");
    expect(encryptPii(once)).toBe(once);
    expect(encryptPii("")).toBe("");
    expect(encryptPii(null)).toBeNull();
    expect(decryptPii(undefined)).toBeUndefined();
  });

  it("plain text saved before encryption existed is read as it is", () => {
    expect(decryptPii("Old Address Line")).toBe("Old Address Line");
    expect(isEncrypted("Old Address Line")).toBe(false);
    expect(needsReencrypt("Old Address Line")).toBe(true);
  });

  it("a tampered value is refused, not silently wrong", () => {
    const v = encryptPii("Priya Sharma");
    const tampered = v.slice(0, -3) + (v.endsWith("A") ? "BBB" : "AAA");
    expect(() => decryptPii(tampered)).toThrow(/can't be decrypted/);
  });

  it("only the personal fields of an address are encrypted", () => {
    const sealed = encryptAddress({
      fullName: "Priya",
      phone: "9876543210",
      line1: "12 MG Road",
      line2: null,
      landmark: "Near temple",
      city: "Hyderabad",
      pincode: "500001",
    });
    expect(sealed.city).toBe("Hyderabad");
    expect(sealed.pincode).toBe("500001");
    expect(sealed.line2).toBeNull();
    for (const f of ["fullName", "phone", "line1", "landmark"] as const)
      expect(isEncrypted(sealed[f])).toBe(true);
    expect(decryptAddress(sealed)).toMatchObject({ fullName: "Priya", line1: "12 MG Road" });
  });

  it("key rotation: values sealed with the previous key still open; they need re-encrypting", () => {
    keys.PII_ENCRYPTION_KEY = "old-dedicated-key-0123456789abcdefghijkl";
    const old = encryptPii("9876543210");
    keys.PII_PREVIOUS_KEY = keys.PII_ENCRYPTION_KEY;
    keys.PII_ENCRYPTION_KEY = "new-dedicated-key-0123456789abcdefghijkl";
    expect(decryptPii(old)).toBe("9876543210");
    expect(needsReencrypt(old)).toBe(true);
    expect(needsReencrypt(encryptPii(decryptPii(old)))).toBe(false);
    // Without the old key, it can't be read: rotation must follow the runbook.
    keys.PII_PREVIOUS_KEY = undefined;
    expect(() => decryptPii(old)).toThrow();
    keys.PII_ENCRYPTION_KEY = undefined;
  });

  it("moving from the derived key to a dedicated one keeps old values readable", () => {
    const derived = encryptPii("Flat 4B");
    keys.PII_ENCRYPTION_KEY = "brand-new-dedicated-key-0123456789abcdef";
    expect(decryptPii(derived)).toBe("Flat 4B");
    keys.PII_ENCRYPTION_KEY = undefined;
  });
});
