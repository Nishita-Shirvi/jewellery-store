import { describe, expect, it } from "vitest";
import { ORDER_TRANSITIONS, canAdminTransition, canTransition } from "@/lib/order-status";
import {
  returnEligibility,
  returnRefundAmount,
  statusAfterRefund,
  validateReturnSelection,
  type ReturnableLine,
} from "@/lib/returns";

const lines: ReturnableLine[] = [
  {
    orderItemId: "a",
    quantity: 2,
    returnedQuantity: 0,
    priceInPaise: 3_600_00,
    isReturnable: true,
  },
  {
    orderItemId: "b",
    quantity: 1,
    returnedQuantity: 0,
    priceInPaise: 61_500_00,
    isReturnable: false,
  },
];
const delivered = new Date("2026-10-01T10:00:00Z");

describe("order state machine", () => {
  it("every status has an entry and nothing leaves REFUNDED", () => {
    expect(Object.keys(ORDER_TRANSITIONS)).toHaveLength(9);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
  });
  it("allows the return and refund paths", () => {
    expect(canTransition("PAID", "REFUND_PENDING")).toBe(true);
    expect(canTransition("DELIVERED", "RETURN_REQUESTED")).toBe(true);
    expect(canTransition("RETURN_REQUESTED", "REFUND_PENDING")).toBe(true);
    expect(canTransition("RETURN_REQUESTED", "DELIVERED")).toBe(true);
    expect(canTransition("REFUND_PENDING", "REFUNDED")).toBe(true);
  });
  it("blocks shortcuts", () => {
    expect(canTransition("SHIPPED", "REFUND_PENDING")).toBe(false); // can't cancel once shipped
    expect(canTransition("PAID", "RETURN_REQUESTED")).toBe(false); // return only after delivery
    expect(canTransition("REFUNDED", "PAID")).toBe(false);
    expect(canAdminTransition("DELIVERED", "REFUNDED")).toBe(false);
  });
});

describe("returnEligibility", () => {
  const order = { status: "DELIVERED" as const, deliveredAt: delivered, hasOpenReturn: false };
  it("is open for 7 days after delivery", () => {
    expect(returnEligibility(order, lines, new Date("2026-10-08T09:59:00Z")).ok).toBe(true);
    expect(returnEligibility(order, lines, new Date("2026-10-08T10:01:00Z"))).toMatchObject({
      ok: false,
    });
  });
  it("needs delivery, no open return and something returnable", () => {
    expect(returnEligibility({ ...order, status: "SHIPPED" }, lines, delivered).ok).toBe(false);
    expect(returnEligibility({ ...order, hasOpenReturn: true }, lines, delivered).ok).toBe(false);
    expect(returnEligibility(order, [lines[1]!], delivered).ok).toBe(false);
  });
});

describe("validateReturnSelection", () => {
  it("accepts returnable items within the remaining quantity", () => {
    expect(validateReturnSelection(lines, [{ orderItemId: "a", quantity: 2 }])).toBeNull();
  });
  it("rejects non-returnable items, too many units, foreign items and empty selections", () => {
    expect(validateReturnSelection(lines, [{ orderItemId: "b", quantity: 1 }])).toMatch(
      /can't be returned/,
    );
    expect(validateReturnSelection(lines, [{ orderItemId: "a", quantity: 3 }])).toMatch(
      /quantities/,
    );
    expect(
      validateReturnSelection(
        [{ ...lines[0]!, returnedQuantity: 2 }],
        [{ orderItemId: "a", quantity: 1 }],
      ),
    ).toMatch(/quantities/);
    expect(validateReturnSelection(lines, [{ orderItemId: "zzz", quantity: 1 }])).toMatch(
      /isn't in this order/,
    );
    expect(validateReturnSelection(lines, [])).toMatch(/at least one/);
  });
});

describe("returnRefundAmount", () => {
  const onlyA = [lines[0]!];
  it("refunds item prices for a partial return", () => {
    expect(returnRefundAmount(onlyA, [{ orderItemId: "a", quantity: 1 }], "DAMAGED", 99_00)).toBe(
      3_600_00,
    );
  });
  it("adds shipping only when everything comes back and it was our fault", () => {
    expect(returnRefundAmount(onlyA, [{ orderItemId: "a", quantity: 2 }], "DAMAGED", 99_00)).toBe(
      7_299_00,
    );
    expect(
      returnRefundAmount(onlyA, [{ orderItemId: "a", quantity: 2 }], "CHANGED_MIND", 99_00),
    ).toBe(7_200_00);
  });
});

describe("statusAfterRefund", () => {
  it("is REFUNDED when everything is back, otherwise DELIVERED", () => {
    expect(statusAfterRefund(7_299_00, 7_299_00)).toBe("REFUNDED");
    expect(statusAfterRefund(7_299_00, 3_600_00)).toBe("DELIVERED");
  });
});

describe("returns after a coupon", () => {
  it("refunds what was actually paid for the line", () => {
    const line = {
      orderItemId: "a",
      quantity: 2,
      returnedQuantity: 0,
      priceInPaise: 3_600_00,
      isReturnable: true,
      netLineInPaise: 6_480_00,
    };
    expect(returnRefundAmount([line], [{ orderItemId: "a", quantity: 1 }], "CHANGED_MIND", 0)).toBe(
      3_240_00,
    );
  });
});
