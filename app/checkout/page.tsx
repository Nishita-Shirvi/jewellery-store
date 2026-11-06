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
import { config } from "@/lib/config";
import { otpAvailable } from "@/services/otp.service";
import { whatsappLink } from "@/lib/support";
import { getSwitches, SWITCHES } from "@/services/switches.service";
import { PageHeader } from "@/components/layout/page-header";
import { TrustNotes } from "@/components/layout/trust-notes";
import { ProductImage } from "@/components/catalog/product-image";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireUserPage("/checkout");
  const [cart, addresses, switches] = await Promise.all([
    getCartView(user.id),
    listAddresses(user.id),
    getSwitches(),
  ]);
  if (cart.itemCount === 0 || cart.hasIssues) redirect("/cart");

  const shipping = shippingFeeFor(cart.subtotalInPaise, getShippingRule());
  const total = cart.subtotalInPaise + shipping;

  // Kill switch (Phase 30): no way to pay while checkout is paused; the cart stays as it is.
  if (switches.checkout.off)
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl md:text-4xl">Checkout</h1>
        <p
          role="status"
          data-testid="checkout-paused"
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {SWITCHES.checkout.paused}
        </p>
        <Link href="/cart" className="mt-6 inline-block text-sm underline">
          Back to your cart
        </Link>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Checkout"
        eyebrow="Secure checkout"
        crumbs={[{ href: "/cart", label: "Cart" }]}
      />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1fr_360px]">
        <CheckoutClient
          addresses={addresses.map((a) => ({
            id: a.id,
            fullName: a.fullName,
            phone: a.phone,
            summary: [a.line1, a.line2, a.landmark, a.city, `${a.state} ${a.pincode}`]
              .filter(Boolean)
              .join(", "),
          }))}
          subtotalInPaise={cart.subtotalInPaise}
          shippingInPaise={shipping}
          storeName={publicEnv.NEXT_PUBLIC_SITE_NAME}
          // Cash on delivery needs its SMS code service in production (Phase 18).
          codEnabled={config.cod.enabled && otpAvailable() && !switches.cod.off}
          contactHref={
            whatsappLink(config.support.whatsapp_number, "Hello, I'd like to place an order.") ??
            "/contact"
          }
          paymentsEnabled={isRazorpayConfigured}
        />

        <aside
          className="border-border h-fit overflow-hidden rounded-lg border bg-white/70 lg:sticky lg:top-24"
          aria-label="Order summary"
        >
          <div className="bg-primary text-primary-foreground px-5 py-3">
            <h2 className="text-xl">Order summary</h2>
          </div>
          <div className="p-5">
            <ul className="space-y-3 text-sm">
              {cart.items.map((item) => (
                <li key={item.variantId} className="flex items-center gap-3">
                  <span className="arch border-border bg-muted w-12 shrink-0 border">
                    <ProductImage src={item.image} alt="" sizes="48px" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {item.name}
                    {item.variantLabel && ` (${item.variantLabel})`} × {item.quantity}
                  </span>
                  <span className="tabular-nums">{formatINR(item.lineTotalInPaise)}</span>
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
              <div className="border-border flex justify-between border-t pt-3 text-lg font-semibold">
                <dt>Total</dt>
                <dd data-testid="checkout-total">{formatINR(total)}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-1 text-xs">Prices include GST.</p>
            <Link href="/cart" className="mt-4 inline-block text-sm underline underline-offset-4">
              Edit cart
            </Link>
            <TrustNotes compact className="border-border mt-5 border-t pt-5" />
          </div>
        </aside>
      </div>
    </div>
  );
}
