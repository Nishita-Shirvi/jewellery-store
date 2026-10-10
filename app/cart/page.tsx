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

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Your cart is empty</h1>
        <p className="text-muted-foreground mt-2">Find something you love and add it here.</p>
        <Button asChild className="mt-6">
          <Link href="/products">Browse jewellery</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <ul className="divide-border border-border divide-y border-y" aria-label="Cart items">
          {cart.items.map((item) => (
            <li key={item.productId} className="flex gap-4 py-5">
              <Link
                href={`/products/${item.slug}`}
                className="border-border bg-muted w-24 shrink-0 overflow-hidden rounded-md border sm:w-28"
              >
                <ProductImage src={item.image} alt={item.name} sizes="112px" />
              </Link>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-between">
                <div>
                  <Link href={`/products/${item.slug}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <p className="text-muted-foreground text-xs">{item.materialSummary}</p>
                  <p className="mt-1 text-sm">{formatINR(item.unitPriceInPaise)} each</p>
                  {item.issue && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      {ISSUE_TEXT[item.issue]}
                    </p>
                  )}
                  <div className="mt-3">
                    <CartLineControls
                      productId={item.productId}
                      name={item.name}
                      quantity={item.quantity}
                      maxQuantity={item.maxQuantity}
                    />
                  </div>
                </div>
                <p
                  className="font-semibold sm:text-right"
                  aria-label={`Line total for ${item.name}`}
                >
                  {formatINR(item.lineTotalInPaise)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <aside className="border-border h-fit rounded-md border p-5" aria-label="Order summary">
          <h2 className="font-medium">Order summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Items</dt>
              <dd>{cart.itemCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Shipping</dt>
              <dd>{shipping === 0 ? "Free" : formatINR(shipping)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Subtotal</dt>
              <dd data-testid="cart-subtotal">{formatINR(cart.subtotalInPaise)}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground mt-1 text-xs">
            Prices include GST.
            {toFree > 0 && cart.itemCount > 0
              ? ` Add ${formatINR(toFree)} more for free shipping.`
              : ""}
          </p>
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
        </aside>
      </div>
    </div>
  );
}
