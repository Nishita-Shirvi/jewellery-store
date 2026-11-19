import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  stepAt,
  totpAt,
  verifyTotp,
} from "@/lib/totp";
import { open, seal } from "@/lib/secret-box";
import {
  ALL_PERMISSIONS,
  PAGE_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  ROLE_KEYS,
} from "@/lib/permissions";

describe("TOTP (RFC 6238 test vectors, SHA-1)", () => {
  // RFC 6238 Appendix B: secret = ASCII "12345678901234567890", 8-digit codes.
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("t=%i → %s", (t, code) => {
    expect(hotp(secret, stepAt(new Date(t * 1000)), 8)).toBe(code);
  });

  it("base32 round-trips and ignores spaces / lower case", () => {
    const raw = Buffer.from([0, 1, 2, 250, 255, 128, 77]);
    expect(base32Decode(base32Encode(raw))).toEqual(raw);
    expect(
      base32Decode(
        secret
          .toLowerCase()
          .match(/.{1,4}/g)!
          .join(" "),
      ),
    ).toEqual(Buffer.from("12345678901234567890"));
    expect(() => base32Decode("not!base32")).toThrow();
  });

  it("accepts the current code and one step of drift; refuses older and reused codes", () => {
    const s = generateTotpSecret();
    const now = new Date("2026-11-03T10:00:15Z");
    const step = stepAt(now);
    expect(verifyTotp(s, totpAt(s, now), now, null)).toBe(step);
    expect(verifyTotp(s, hotp(s, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(s, hotp(s, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(s, hotp(s, step - 2), now, null)).toBeNull(); // too old
    expect(verifyTotp(s, totpAt(s, now), now, step)).toBeNull(); // already used
    expect(verifyTotp(s, hotp(s, step - 1), now, step)).toBeNull(); // older than last used
    expect(verifyTotp(s, "12345", now, null)).toBeNull();
    expect(verifyTotp(s, "abcdef", now, null)).toBeNull();
  });

  it("secrets are 160-bit and random; the app link carries them", () => {
    const a = generateTotpSecret();
    expect(base32Decode(a)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(a);
    const uri = otpauthUri(a, "owner@example.com", "Jewellery Store");
    expect(uri).toMatch(/^otpauth:\/\/totp\/Jewellery%20Store%3Aowner%40example\.com\?/);
    expect(new URL(uri).searchParams.get("secret")).toBe(a);
  });
});

describe("secret box (stored authenticator secrets)", () => {
  const key = "auth-secret-for-tests-0123456789abcdef";
  it("round-trips, and the stored text doesn't contain the secret", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP", key, "totp");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(open(sealed, key, "totp")).toBe("JBSWY3DPEHPK3PXP");
    expect(seal("x", key, "totp")).not.toBe(seal("x", key, "totp")); // random IV
  });
  it("refuses a wrong key, wrong purpose or any tampering", () => {
    const sealed = seal("JBSWY3DPEHPK3PXP", key, "totp");
    expect(() => open(sealed, `${key}x`, "totp")).toThrow();
    expect(() => open(sealed, key, "other")).toThrow();
    const parts = sealed.split(".");
    parts[3] = `${parts[3]!.slice(0, -2)}AA`;
    expect(() => open(parts.join("."), key, "totp")).toThrow();
    expect(() => open("garbage", key, "totp")).toThrow();
  });
});

describe("roles and permissions", () => {
  it("SUPPORT looks up orders/products and answers customers — no refunds, edits or money", () => {
    expect([...ROLES.SUPPORT.permissions].sort()).toEqual([
      "faqs.manage",
      "orders.view",
      "products.view",
      "support.manage",
    ]);
  });
  it("only OWNER manages staff; MANAGER has everything else", () => {
    for (const key of ROLE_KEYS)
      expect((ROLES[key].permissions as readonly string[]).includes("staff.manage")).toBe(
        key === "OWNER",
      );
    expect(ROLES.MANAGER.permissions).toHaveLength(ALL_PERMISSIONS.length - 1);
  });
  it("catalog editors can't touch orders or refunds; order managers can't edit products", () => {
    const cat = ROLES.CATALOG_EDITOR.permissions as readonly string[];
    expect(cat.some((p) => p.startsWith("orders.") || p.startsWith("refunds."))).toBe(false);
    expect((ROLES.ORDER_MANAGER.permissions as readonly string[]).includes("products.edit")).toBe(
      false,
    );
  });
  it("every role permission exists", () => {
    for (const key of ROLE_KEYS)
      for (const p of ROLES[key].permissions) expect(Object.keys(PERMISSIONS)).toContain(p);
  });
  it("every admin page folder is listed with a permission (so the nav and checks can't miss one)", () => {
    const root = path.join(process.cwd(), "app", "admin");
    const tops = readdirSync(root).filter((d) => statSync(path.join(root, d)).isDirectory());
    const listed = PAGE_PERMISSIONS.map((p) => p.href.replace("/admin/", ""));
    for (const dir of tops) expect(listed).toContain(dir);
  });
});
