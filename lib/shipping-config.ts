import "server-only";
import { config } from "@/lib/config";
import type { ShippingRule } from "@/lib/shipping-fee";

export function getShippingRule(): ShippingRule {
  return {
    feeInPaise: config.shipping.fee_rupees * 100,
    freeAboveInPaise: config.shipping.free_above_rupees * 100,
  };
}
