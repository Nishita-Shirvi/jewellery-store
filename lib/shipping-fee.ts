/** Pure shipping-fee rule (unit-tested). All amounts in paise. */
export interface ShippingRule {
  feeInPaise: number;
  freeAboveInPaise: number;
}

/** Free when the subtotal reaches the threshold; otherwise the flat fee. Empty carts ship free. */
export function shippingFeeFor(subtotalInPaise: number, rule: ShippingRule): number {
  if (subtotalInPaise <= 0) return 0;
  return subtotalInPaise >= rule.freeAboveInPaise ? 0 : rule.feeInPaise;
}

/** How much more the customer needs to add for free shipping (0 if already free). */
export function amountToFreeShipping(subtotalInPaise: number, rule: ShippingRule): number {
  return Math.max(0, rule.freeAboveInPaise - subtotalInPaise);
}
