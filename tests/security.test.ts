import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { safeRedirectPath } from "@/lib/safe-redirect";
import { getClientIp } from "@/lib/request";
import { maskPersonal } from "@/lib/logger";
import { buildCsp } from "@/lib/csp";

describe("open redirects (Phase 23 review M1)", () => {
  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com", // what /login?callbackUrl=/%09/evil.com decodes to
    "/\n/evil.com",
    "/\r//evil.com",
    "\t//evil.com",
    "/\u0000/evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    `/${"a".repeat(600)}`,
  ])("refuses %j", (value) => expect(safeRedirectPath(value, "/account")).toBe("/account"));

  it.each([
    "/account",
    "/admin/orders?status=PAID",
    "/staff/2fa?callbackUrl=%2Fadmin",
    "/products/ring#reviews",
  ])("keeps %s", (value) => expect(safeRedirectPath(value)).toBe(value));

  it("non-strings fall back", () => {
    expect(safeRedirectPath(null, "/x")).toBe("/x");
    expect(safeRedirectPath(["/a"], "/x")).toBe("/x");
  });
});

describe("client IP for rate limits (review M2)", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("prefers the headers Vercel sets itself", () => {
    expect(
      getClientIp(h({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1, 203.0.113.9" })),
    ).toBe("203.0.113.9");
    expect(getClientIp(h({ "x-vercel-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
  });
  it("otherwise trusts the entry added by the nearest proxy, not the one the client wrote", () => {
    expect(getClientIp(h({ "x-forwarded-for": "6.6.6.6, 10.0.0.5" }))).toBe("10.0.0.5");
    expect(getClientIp(h({}))).toBe("unknown");
  });
});

describe("personal data in logs (review L4)", () => {
  it("masks emails and phone numbers", () => {
    expect(maskPersonal("priya.sharma@gmail.com")).toBe("pr***@gmail.com");
    expect(maskPersonal("9876543210")).toBe("98******10");
    expect(maskPersonal("x")).toBe("***");
  });
});

describe("Content-Security-Policy", () => {
  const prod = buildCsp({
    isProd: true,
    appUrl: "https://shop.example.in",
    sentryDsn: "https://abc@o123.ingest.sentry.io/456",
  });
  const dir = (csp: string, name: string) =>
    csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

  it("blocks framing, plugins, foreign forms and base-tag tricks", () => {
    expect(dir(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(dir(prod, "object-src")).toBe("object-src 'none'");
    expect(dir(prod, "base-uri")).toBe("base-uri 'self'");
    expect(dir(prod, "form-action")).toBe("form-action 'self' https://accounts.google.com");
    expect(prod).toContain("upgrade-insecure-requests");
    // A plain-http site (local test server) must not be told to upgrade, or every fetch fails.
    expect(buildCsp({ isProd: true, appUrl: "http://localhost:3100" })).not.toContain(
      "upgrade-insecure",
    );
  });
  it("allows Razorpay and the Sentry host from the DSN; no eval in production", () => {
    expect(dir(prod, "script-src")).toContain("https://checkout.razorpay.com");
    expect(dir(prod, "script-src")).not.toContain("unsafe-eval");
    expect(dir(prod, "frame-src")).toBe(
      "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    );
    expect(dir(prod, "connect-src")).toContain("https://o123.ingest.sentry.io");
  });
  it("the test payment stand-in is allowed only when configured, and only http(s)", () => {
    expect(prod).not.toContain("localhost");
    const test = buildCsp({ isProd: true, extraConnect: "http://localhost:4010" });
    expect(dir(test, "connect-src")).toContain("http://localhost:4010");
    expect(buildCsp({ isProd: true, extraConnect: "javascript:alert(1)" })).not.toContain(
      "javascript",
    );
  });
});
