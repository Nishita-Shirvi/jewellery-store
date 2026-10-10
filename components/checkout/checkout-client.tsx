"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddressForm } from "./address-form";
import { PayButton } from "./pay-button";

export interface AddressOption {
  id: string;
  fullName: string;
  phone: string;
  summary: string;
}

export function CheckoutClient({
  addresses,
  payLabel,
  storeName,
  paymentsEnabled,
}: {
  addresses: AddressOption[];
  payLabel: string;
  storeName: string;
  paymentsEnabled: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(addresses[0]?.id ?? null);
  const [adding, setAdding] = useState(addresses.length === 0);

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

      <section aria-labelledby="payment-heading">
        <h2 id="payment-heading" className="text-lg font-medium">
          Payment
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          UPI, cards, netbanking and wallets via Razorpay.
        </p>
        <div className="mt-4 max-w-sm">
          {paymentsEnabled ? (
            <PayButton
              label={payLabel}
              storeName={storeName}
              addressId={selected}
              disabled={!selected}
            />
          ) : (
            <p className="border-border rounded-md border border-dashed p-3 text-sm">
              Online payments aren&apos;t set up yet. Add the Razorpay keys to <code>.env</code>.
            </p>
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
