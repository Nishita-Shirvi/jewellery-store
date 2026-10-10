import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { RAZORPAY_API_BASE: "https://api.razorpay.com" } }));

const { verifyPaymentSignature, verifyWebhookSignature, signaturesMatch } =
  await import("@/lib/payments/razorpay");

const SECRET = "test_secret_123";
const sign = (payload: string, secret = SECRET) =>
  createHmac("sha256", secret).update(payload).digest("hex");

describe("verifyPaymentSignature", () => {
  it("accepts Razorpay's signature for order_id|payment_id", () => {
    expect(
      verifyPaymentSignature("order_ABC123", "pay_XYZ789", sign("order_ABC123|pay_XYZ789"), SECRET),
    ).toBe(true);
  });
  it("rejects a signature for a different payment", () => {
    expect(
      verifyPaymentSignature("order_ABC123", "pay_OTHER1", sign("order_ABC123|pay_XYZ789"), SECRET),
    ).toBe(false);
  });
  it("rejects a signature made with another secret", () => {
    expect(
      verifyPaymentSignature(
        "order_ABC123",
        "pay_XYZ789",
        sign("order_ABC123|pay_XYZ789", "wrong"),
        SECRET,
      ),
    ).toBe(false);
  });
  it("rejects malformed input without throwing", () => {
    expect(verifyPaymentSignature("order_A", "pay_B", "not-hex!", SECRET)).toBe(false);
    expect(verifyPaymentSignature("order_A", "pay_B", "", SECRET)).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event: "payment.captured", payload: {} });
  it("accepts the HMAC of the exact raw body", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });
  it("rejects if the body was changed by even one character", () => {
    expect(verifyWebhookSignature(body.replace("captured", "Captured"), sign(body), SECRET)).toBe(
      false,
    );
  });
});

describe("signaturesMatch", () => {
  it("rejects different lengths", () => {
    expect(signaturesMatch("abcd", "abc")).toBe(false);
  });
});
