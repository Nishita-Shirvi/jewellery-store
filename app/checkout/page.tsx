import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { requireUserPage } from "@/lib/auth-guards";
import { isRazorpayConfigured, publicEnv } from "@/lib/env";
import { formatINR } from "@/lib/format";
import { listAddresses } from "@/services/address.service";
import { getCartView } from "@/services/cart.service";
import { getShippingRule } from "@/lib/shipping-config";
import { shippingFeeFor } from "@/lib/shipping-fee";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireUserPage("/checkout");
  const [cart, addresses] = await Promise.all([getCartView(user.id), listAddresses(user.id)]);
  if (cart.itemCount === 0 || cart.hasIssues) redirect("/cart");

  const shipping = shippingFeeFor(cart.subtotalInPaise, getShippingRule());
  const total = cart.subtotalInPaise + shipping;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <CheckoutClient
          addresses={addresses.map((a) => ({
            id: a.id,
            fullName: a.fullName,
            phone: a.phone,
            summary: [a.line1, a.line2, a.landmark, a.city, `${a.state} ${a.pincode}`]
              .filter(Boolean)
              .join(", "),
          }))}
          payLabel={`Pay ${formatINR(total)}`}
          storeName={publicEnv.NEXT_PUBLIC_SITE_NAME}
          paymentsEnabled={isRazorpayConfigured}
        />

        <aside className="border-border h-fit rounded-md border p-5" aria-label="Order summary">
          <h2 className="font-medium">Order summary</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {cart.items.map((item) => (
              <li key={item.productId} className="flex justify-between gap-4">
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>{formatINR(item.lineTotalInPaise)}</span>
              </li>
            ))}
          </ul>
          <dl className="border-border mt-4 space-y-1 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{formatINR(cart.subtotalInPaise)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>{shipping === 0 ? "Free" : formatINR(shipping)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd data-testid="checkout-total">{formatINR(total)}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground mt-1 text-xs">Prices include GST.</p>
          <Link href="/cart" className="mt-4 inline-block text-sm underline underline-offset-4">
            Edit cart
          </Link>
        </aside>
      </div>
    </div>
  );
}
