import "server-only";
import { env } from "@/lib/env";
import type { ShippingRule } from "@/lib/shipping-fee";

export function getShippingRule(): ShippingRule {
  return {
    feeInPaise: env.SHIPPING_FEE_RUPEES * 100,
    freeAboveInPaise: env.FREE_SHIPPING_ABOVE_RUPEES * 100,
  };
}
