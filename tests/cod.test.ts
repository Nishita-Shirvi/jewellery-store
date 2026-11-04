import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  codDecision,
  maskMobile,
  normaliseMobile,
  parsePincodeList,
  pincodeAllowed,
  type CodContext,
  type CodRules,
} from "@/lib/cod";
import { codCollectAmount } from "@/lib/shipping/shiprocket";
import { ADMIN_TRANSITIONS, PAID_STATUSES, canTransition } from "@/lib/order-status";
import { paymentMethodKey } from "@/services/report.service";
import { placeCodSchema } from "@/lib/validation/checkout";

const rules: CodRules = {
  enabled: true,
  maxOrderInPaise: 10_000_00,
  feeInPaise: 0,
  pincodes: [],
  maxRefusals: 2,
  otpRequired: true,
};
const ctx: CodContext = {
  totalBeforeFeeInPaise: 4_400_00,
  pincode: "500001",
  refusals: 0,
  otpAvailable: true,
  courierCod: null,
};

describe("COD rules", () => {
  it("allows a normal order and adds the fee to the total", () => {
    expect(codDecision(rules, ctx)).toEqual({ ok: true, feeInPaise: 0, totalInPaise: 4_400_00 });
    expect(codDecision({ ...rules, feeInPaise: 49_00 }, ctx)).toEqual({
      ok: true,
      feeInPaise: 49_00,
      totalInPaise: 4_449_00,
    });
  });

  it("limit is on the total INCLUDING the fee; exactly the limit is allowed", () => {
    expect(codDecision(rules, { ...ctx, totalBeforeFeeInPaise: 10_000_00 }).ok).toBe(true);
    expect(codDecision(rules, { ...ctx, totalBeforeFeeInPaise: 10_000_01 }).ok).toBe(false);
    // 9,990 + 49 fee = 10,039 > 10,000
    expect(
      codDecision({ ...rules, feeInPaise: 49_00 }, { ...ctx, totalBeforeFeeInPaise: 9_990_00 }).ok,
    ).toBe(false);
  });

  it("blocks customers at the refusal limit (and not one below it)", () => {
    expect(codDecision(rules, { ...ctx, refusals: 1 }).ok).toBe(true);
    const r = codDecision(rules, { ...ctx, refusals: 2 });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toMatch(/refused/);
  });

  it("respects the pincode allow-list (prefixes) and the courier's COD coverage", () => {
    const only = { ...rules, pincodes: ["500", "560001"] };
    expect(codDecision(only, ctx).ok).toBe(true);
    expect(codDecision(only, { ...ctx, pincode: "560001" }).ok).toBe(true);
    expect(codDecision(only, { ...ctx, pincode: "560002" }).ok).toBe(false);
    expect(codDecision(rules, { ...ctx, courierCod: false }).ok).toBe(false);
    expect(codDecision(rules, { ...ctx, courierCod: true }).ok).toBe(true);
  });

  it("is off when disabled, or when codes can't be sent and they're required", () => {
    expect(codDecision({ ...rules, enabled: false }, ctx).ok).toBe(false);
    expect(codDecision(rules, { ...ctx, otpAvailable: false }).ok).toBe(false);
    expect(codDecision({ ...rules, otpRequired: false }, { ...ctx, otpAvailable: false }).ok).toBe(
      true,
    );
  });

  it("rejects malformed pincodes", () => {
    for (const pincode of ["", "50001", "5000011", "50000a", "500 01"])
      expect(codDecision(rules, { ...ctx, pincode }).ok).toBe(false);
  });

  it("parses the config pincode list, ignoring junk", () => {
    expect(parsePincodeList(" 500, 560001 ,,abc, 1234567")).toEqual(["500", "560001"]);
    expect(pincodeAllowed("400001", [])).toBe(true);
  });
});

describe("mobile numbers", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["09876543210", "9876543210"],
    ["919876543210", "9876543210"],
  ])("%s → %s", (raw, out) => expect(normaliseMobile(raw)).toBe(out));
  it.each(["12345", "5876543210", "98765432101", "+1 415 555 0100", ""])("rejects %s", (raw) =>
    expect(normaliseMobile(raw)).toBeNull(),
  );
  it("masks all but the first 2 and last 3 digits", () => {
    expect(maskMobile("9876543210")).toBe("98•••••210");
  });
});

describe("Shiprocket COD amount", () => {
  const base = {
    orderId: "o1",
    orderDate: new Date(),
    customer: { name: "A B", email: "a@b.c", phone: "9876543210" },
    address: { line1: "x", city: "y", state: "Telangana", pincode: "500001" },
    items: [],
    subTotalInPaise: 5_000_00,
    shippingInPaise: 99_00,
    weightGrams: 10,
  };
  it("courier collects items + shipping + fee − discount, i.e. the order total", () => {
    expect(codCollectAmount({ ...base, cod: { feeInPaise: 49_00, discountInPaise: 500_00 } })).toBe(
      5_000_00 + 99_00 + 49_00 - 500_00,
    );
    expect(codCollectAmount(base)).toBe(0); // prepaid: nothing to collect
  });
});

describe("order state machine with cash on delivery", () => {
  it("COD orders ship, deliver or get cancelled — never 'paid' by Razorpay", () => {
    expect(canTransition("CONFIRMED", "SHIPPED")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransition("CONFIRMED", "PAID")).toBe(false);
    expect(canTransition("CONFIRMED", "REFUND_PENDING")).toBe(false); // nothing was paid
    expect(canTransition("SHIPPED", "CANCELLED")).toBe(true); // refused parcel (RTO)
    expect(ADMIN_TRANSITIONS.CONFIRMED).toEqual(["SHIPPED", "CANCELLED"]);
    expect(ADMIN_TRANSITIONS.SHIPPED).not.toContain("CANCELLED"); // admins can't cancel a parcel on the road
  });
  it("a confirmed COD order is not revenue until its cash is recorded", () => {
    expect(PAID_STATUSES).not.toContain("CONFIRMED");
  });
});

describe("payment method keys for reports", () => {
  it("maps Razorpay methods and COD; anything else is 'other'", () => {
    expect(paymentMethodKey("COD", null)).toBe("cod");
    expect(paymentMethodKey("ONLINE", "upi")).toBe("upi");
    expect(paymentMethodKey("ONLINE", "EMI")).toBe("emi");
    expect(paymentMethodKey("ONLINE", "netbanking")).toBe("netbanking");
    expect(paymentMethodKey("ONLINE", null)).toBe("other");
    expect(paymentMethodKey("ONLINE", "cod")).toBe("other"); // an online payment can't claim to be COD
  });
});

describe("COD order input", () => {
  const ok = {
    addressId: "addr1",
    checkoutKey: "3b241101-e2bb-4255-8caf-4136c566a962",
    challengeId: "ch1",
    code: "123456",
  };
  it("accepts a 6-digit code", () => expect(placeCodSchema.safeParse(ok).success).toBe(true));
  it.each(["12345", "1234567", "12345a", "' OR 1=1"])("rejects code %s", (code) =>
    expect(placeCodSchema.safeParse({ ...ok, code }).success).toBe(false),
  );
  it("rejects a checkout key that isn't a UUID", () =>
    expect(placeCodSchema.safeParse({ ...ok, checkoutKey: "abc" }).success).toBe(false));
});
