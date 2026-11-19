import type { Metadata } from "next";
import Link from "next/link";
import { CartLineControls } from "@/components/cart/cart-line-controls";
import { ProductImage } from "@/components/catalog/product-image";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth-guards";
import { formatINR } from "@/lib/format";
import { getCartView } from "@/services/cart.service";
import { getShippingRule } from "@/lib/shipping-config";
import { amountToFreeShipping, shippingFeeFor } from "@/lib/shipping-fee";
import { RecentlyViewedRow, RecoRow } from "@/components/reco/reco-row";
import { PageHeader } from "@/components/layout/page-header";
import { FreeShippingMeter, TrustNotes } from "@/components/layout/trust-notes";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

const ISSUE_TEXT = {
  unavailable: "No longer available. Please remove it.",
  out_of_stock: "Out of stock. Please remove it.",
  reduced: "Quantity reduced to what's in stock.",
} as const;

export default async function CartPage() {
  const user = await getCurrentUser();
  const cart = await getCartView(user?.id ?? null);
  const rule = getShippingRule();
  const shipping = shippingFeeFor(cart.subtotalInPaise, rule);
  const toFree = amountToFreeShipping(cart.subtotalInPaise, rule);
  const cartIds = [...new Set(cart.items.map((i) => i.productId))].sort().join(",");

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <div
          aria-hidden="true"
          className="arch border-border bg-muted mx-auto mb-6 h-28 w-22 border"
        />
        <h1 className="text-3xl md:text-4xl">Your cart is empty</h1>
        <p className="text-muted-foreground mt-3">Find something you love and add it here.</p>
        <Button asChild className="mt-7" size="lg">
          <Link href="/products">Browse jewellery</Link>
        </Button>
        <div className="mt-6 text-left">
          <RecentlyViewedRow />
          <RecoRow widget="trending" query="w=trending" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Your cart"
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/products", label: "Jewellery" },
        ]}
      >
        <p className="text-muted-foreground text-sm">
          {cart.itemCount} {cart.itemCount === 1 ? "piece" : "pieces"}
        </p>
      </PageHeader>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1fr_340px]">
        <ul className="space-y-4" aria-label="Cart items">
          {cart.items.map((item) => (
            <li
              key={item.variantId}
              className="border-border flex gap-4 rounded-lg border bg-white/60 p-4"
            >
              <Link
                href={`/products/${item.slug}`}
                className="arch border-border bg-muted w-24 shrink-0 self-start border sm:w-28"
              >
                <ProductImage src={item.image} alt={item.name} sizes="112px" />
              </Link>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-between">
                <div>
                  <Link
                    href={`/products/${item.slug}`}
                    className="text-lg leading-snug underline-offset-4 hover:underline"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {item.name}
                  </Link>
                  {item.variantLabel && (
                    <p className="text-sm" data-testid="cart-variant">
                      {item.variantLabel}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">{item.materialSummary}</p>
                  <p className="mt-1 text-sm">{formatINR(item.unitPriceInPaise)} each</p>
                  {item.issue && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      {ISSUE_TEXT[item.issue]}
                    </p>
                  )}
                  <div className="mt-3">
                    <CartLineControls
                      variantId={item.variantId}
                      name={item.name}
                      quantity={item.quantity}
                      maxQuantity={item.maxQuantity}
                    />
                  </div>
                </div>
                <p
                  className="text-lg font-semibold tabular-nums sm:text-right"
                  aria-label={`Line total for ${item.name}`}
                >
                  {formatINR(item.lineTotalInPaise)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <aside
          className="border-border h-fit overflow-hidden rounded-lg border bg-white/70 lg:sticky lg:top-24"
          aria-label="Order summary"
        >
          <div className="bg-primary text-primary-foreground px-5 py-3">
            <h2 className="text-xl">Order summary</h2>
          </div>
          <div className="p-5">
            <FreeShippingMeter
              subtotalInPaise={cart.subtotalInPaise}
              freeAboveInPaise={rule.freeAboveInPaise}
              remainingLabel={toFree > 0 ? formatINR(toFree) : null}
            />
            <dl className="border-border mt-5 space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Items</dt>
                <dd>{cart.itemCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd>{shipping === 0 ? "Free" : formatINR(shipping)}</dd>
              </div>
              <div className="border-border flex justify-between border-t pt-3 text-lg font-semibold">
                <dt>Subtotal</dt>
                <dd data-testid="cart-subtotal">{formatINR(cart.subtotalInPaise)}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-1 text-xs">Prices include GST.</p>
            {cart.itemCount > 0 ? (
              <Button asChild className="mt-5 w-full">
                <Link href="/checkout">Proceed to checkout</Link>
              </Button>
            ) : (
              <Button className="mt-5 w-full" disabled>
                Proceed to checkout
              </Button>
            )}
            {!user && (
              <p className="text-muted-foreground mt-3 text-xs">
                You&apos;ll be asked to log in. Your cart is kept.
              </p>
            )}
            <TrustNotes compact className="border-border mt-5 border-t pt-5" />
          </div>
        </aside>
      </div>
      <div className="mx-auto max-w-6xl px-4">
        {/* Recommendations (Phase 25): stream in after the cart itself. */}
        {toFree > 0 && (
          <RecoRow
            widget="upsell"
            query={`w=upsell&gap=${toFree}&ids=${cartIds}`}
            title={`Add ${formatINR(toFree)} more for free shipping`}
            subtitle="Any one of these gets your order delivered free."
          />
        )}
        <RecoRow
          widget="bought_together"
          query={`w=cart&ids=${cartIds}`}
          title="Customers also bought"
        />
      </div>
    </div>
  );
}
