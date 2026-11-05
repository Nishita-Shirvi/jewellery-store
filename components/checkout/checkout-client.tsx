"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddressForm } from "./address-form";
import { PayButton } from "./pay-button";
import { CouponBox } from "./coupon-box";
import { CodPanel } from "./cod-panel";
import { formatINR } from "@/lib/format";

export interface AddressOption {
  id: string;
  fullName: string;
  phone: string;
  summary: string;
}

export function CheckoutClient({
  addresses,
  subtotalInPaise,
  shippingInPaise,
  storeName,
  paymentsEnabled,
  codEnabled = false,
  contactHref = "/contact",
}: {
  addresses: AddressOption[];
  subtotalInPaise: number;
  shippingInPaise: number;
  storeName: string;
  paymentsEnabled: boolean;
  /** Cash on delivery switched on in config.ini (each order is still checked on the server). */
  codEnabled?: boolean;
  /** Where to send people when no payment method is connected yet (WhatsApp link or /contact). */
  contactHref?: string;
}) {
  const [coupon, setCoupon] = useState<{ code: string; discountInPaise: number } | null>(null);
  const total = subtotalInPaise - (coupon?.discountInPaise ?? 0) + shippingInPaise;
  const payLabel = `Pay ${formatINR(total)}`;
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(addresses[0]?.id ?? null);
  const [adding, setAdding] = useState(addresses.length === 0);
  // Only offer what's actually connected; start on the one that is.
  const [method, setMethod] = useState<"online" | "cod">(
    paymentsEnabled || !codEnabled ? "online" : "cod",
  );
  const noPayment = !paymentsEnabled && !codEnabled;

  return (
    <div className="space-y-8">
      <section aria-labelledby="address-heading">
        <h2 id="address-heading" className="text-lg font-medium">
          Delivery address
        </h2>
        {addresses.length > 0 && (
          <fieldset className="mt-4 space-y-3">
            <legend className="sr-only">Choose a delivery address</legend>
            {addresses.map((a) => (
              <label
                key={a.id}
                className="border-border has-[:checked]:border-foreground flex cursor-pointer gap-3 rounded-md border p-4"
              >
                <input
                  type="radio"
                  name="address"
                  value={a.id}
                  checked={selected === a.id}
                  onChange={() => setSelected(a.id)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium">{a.fullName}</span> · {a.phone}
                  <br />
                  <span className="text-muted-foreground">{a.summary}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="mt-4">
          {adding ? (
            <div className="border-border rounded-md border p-4">
              <AddressForm
                onSaved={(id) => {
                  setSelected(id);
                  setAdding(false);
                  router.refresh();
                }}
              />
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              Add a new address
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="coupon-heading">
        <h2 id="coupon-heading" className="text-lg font-medium">
          Coupon
        </h2>
        <div className="mt-3">
          <CouponBox
            onChange={(c) =>
              setCoupon(c ? { code: c.code, discountInPaise: c.discountInPaise } : null)
            }
          />
        </div>
        {coupon && (
          <p className="mt-2 text-sm" data-testid="checkout-discount">
            Discount: −{formatINR(coupon.discountInPaise)} · New total {formatINR(total)}
          </p>
        )}
      </section>

      <section aria-labelledby="payment-heading">
        <h2 id="payment-heading" className="text-lg font-medium">
          Payment
        </h2>
        {codEnabled && paymentsEnabled && (
          <fieldset className="mt-3 flex flex-wrap gap-3">
            <legend className="sr-only">How would you like to pay?</legend>
            {(
              [
                ["online", "Pay online"],
                ["cod", "Cash on delivery"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="border-border has-[:checked]:border-foreground flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="payment-method"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        {!noPayment && (
          <p className="text-muted-foreground mt-2 text-sm">
            {method === "cod"
              ? "Pay the courier when your order arrives. We'll confirm your mobile number by SMS."
              : "UPI, cards, netbanking, EMI and wallets via Razorpay."}
          </p>
        )}
        <div className="mt-4 max-w-sm">
          {method === "cod" ? (
            <CodPanel addressId={selected} couponCode={coupon?.code} />
          ) : paymentsEnabled ? (
            <PayButton
              label={payLabel}
              storeName={storeName}
              addressId={selected}
              couponCode={coupon?.code}
              disabled={!selected}
            />
          ) : (
            <div
              className="border-border rounded-md border border-dashed p-4 text-sm"
              data-testid="payments-pending"
            >
              <p className="font-medium">Online checkout is opening soon.</p>
              <p className="text-muted-foreground mt-1">
                We&apos;re finishing the payment setup. To order now, message us and we&apos;ll
                confirm your order and the payment details personally.
              </p>
              <a href={contactHref} className="mt-3 inline-block underline underline-offset-4">
                Contact us to order
              </a>
            </div>
          )}
          {!selected && paymentsEnabled && (
            <p className="text-muted-foreground mt-2 text-xs">
              Add or choose an address to continue.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
