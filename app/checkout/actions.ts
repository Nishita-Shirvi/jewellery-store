"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";
import { rateLimit } from "@/lib/rate-limit";
import { getCartView } from "@/services/cart.service";
import { countFunnel } from "@/services/report.service";
import { checkCoupon } from "@/services/coupon.service";
import {
  couponCodeSchema,
  addressSchema,
  orderIdSchema,
  startCheckoutSchema,
  verifyPaymentSchema,
} from "@/lib/validation/checkout";
import { TooManyAddressesError, createAddress } from "@/services/address.service";
import {
  markOrderPaid,
  resumePayment,
  startCheckout,
  type CheckoutResult,
} from "@/services/order.service";

export interface AddressFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  addressId?: string;
}

export async function addAddressAction(
  _prev: AddressFormState,
  formData: FormData,
): Promise<AddressFormState> {
  const user = await requireUser();
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    const address = await createAddress(user.id, parsed.data);
    revalidatePath("/checkout");
    return { ok: true, addressId: address.id };
  } catch (error) {
    if (error instanceof TooManyAddressesError) return { error: error.message };
    throw error;
  }
}

export async function startCheckoutAction(input: {
  addressId: string;
  checkoutKey: string;
  couponCode?: string;
}): Promise<CheckoutResult> {
  const user = await requireUser();
  const parsed = startCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please choose a delivery address." };

  const limit = rateLimit(`checkout:${user.id}`, 10, 10 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  const result = await startCheckout(user, parsed.data);
  if (result.ok) await countFunnel("begin_checkout");
  return result;
}

export async function retryPaymentAction(input: { orderId: string }): Promise<CheckoutResult> {
  const user = await requireUser();
  const parsed = orderIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Order not found." };
  return resumePayment(user, parsed.data.orderId);
}

export type VerifyResult = { ok: true; redirectTo: string } | { ok: false; error: string };

/** Step 4: the browser reports success. Nothing is trusted until the signature checks out. */
export async function verifyPaymentAction(input: unknown): Promise<VerifyResult> {
  const user = await requireUser();
  const parsed = verifyPaymentSchema.safeParse(input);
  if (!parsed.success || !env.RAZORPAY_KEY_SECRET) {
    logger.warn("payment.callback_invalid_input", { userId: user.id });
    return { ok: false, error: "We couldn't verify the payment." };
  }
  const p = parsed.data;

  if (
    !verifyPaymentSignature(
      p.razorpay_order_id,
      p.razorpay_payment_id,
      p.razorpay_signature,
      env.RAZORPAY_KEY_SECRET,
    )
  ) {
    logger.warn("payment.callback_bad_signature", { userId: user.id, orderId: p.orderId });
    return { ok: false, error: "We couldn't verify the payment." };
  }

  const result = await markOrderPaid({
    razorpayOrderId: p.razorpay_order_id,
    razorpayPaymentId: p.razorpay_payment_id,
    rawPayload: {
      source: "checkout_callback",
      razorpay_order_id: p.razorpay_order_id,
      razorpay_payment_id: p.razorpay_payment_id,
    },
    source: "callback",
  });

  // The signed Razorpay order must belong to the order (and user) on this page.
  if (result.orderId !== p.orderId) {
    logger.error("payment.callback_order_mismatch", {
      userId: user.id,
      orderId: p.orderId,
      matched: result.orderId,
    });
    return { ok: false, error: "We couldn't verify the payment." };
  }

  revalidatePath("/", "layout");
  if (result.outcome === "sold_out")
    return { ok: true, redirectTo: `/orders/${p.orderId}/failed?reason=sold_out` };
  if (result.outcome === "paid" || result.outcome === "already_processed") {
    return { ok: true, redirectTo: `/orders/${p.orderId}/success` };
  }
  return { ok: false, error: "We couldn't verify the payment." };
}

export type CouponCheck =
  | { ok: true; code: string; discountInPaise: number; description: string }
  | { ok: false; error: string };

/** Preview a coupon against the current cart (the real check happens again at payment). */
export async function applyCouponAction(code: string): Promise<CouponCheck> {
  const user = await requireUser();
  if (!rateLimit(`coupon:${user.id}`, 20, 10 * 60 * 1000).ok)
    return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  const parsed = couponCodeSchema.safeParse(code);
  if (!parsed.success || !parsed.data) return { ok: false, error: "Enter a coupon code." };
  const cart = await getCartView(user.id);
  const result = await checkCoupon(parsed.data, user.id, cart.subtotalInPaise);
  return result.ok
    ? {
        ok: true,
        code: result.code!,
        discountInPaise: result.discountInPaise,
        description: result.description!,
      }
    : result;
}
