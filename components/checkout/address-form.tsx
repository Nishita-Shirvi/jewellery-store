"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { addAddressAction, type AddressFormState } from "@/app/checkout/actions";
import { INDIAN_STATES } from "@/lib/india";

export function AddressForm({ onSaved }: { onSaved?: (addressId: string) => void }) {
  const [state, formAction, pending] = useActionState<AddressFormState, FormData>(
    addAddressAction,
    {},
  );
  const e = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && state.addressId) onSaved?.(state.addressId);
  }, [state, onSaved]);

  return (
    <form
      action={formAction}
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      aria-label="New address"
    >
      {state.error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      <FormField label="Full name" name="fullName" autoComplete="name" errors={e.fullName} />
      <FormField
        label="Mobile number"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        errors={e.phone}
      />
      <div className="sm:col-span-2">
        <FormField
          label="House / flat, street"
          name="line1"
          autoComplete="address-line1"
          errors={e.line1}
        />
      </div>
      <div className="sm:col-span-2">
        <FormField
          label="Area, colony (optional)"
          name="line2"
          autoComplete="address-line2"
          errors={e.line2}
        />
      </div>
      <FormField label="Landmark (optional)" name="landmark" errors={e.landmark} />
      <FormField label="City" name="city" autoComplete="address-level2" errors={e.city} />
      <div className="space-y-1.5">
        <Label htmlFor="state">State</Label>
        <select
          id="state"
          name="state"
          defaultValue=""
          aria-invalid={e.state ? true : undefined}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm aria-invalid:border-red-600"
        >
          <option value="" disabled>
            Choose a state
          </option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {e.state && <p className="text-xs text-red-700">{e.state[0]}</p>}
      </div>
      <FormField
        label="Pincode"
        name="pincode"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        errors={e.pincode}
      />
      <div className="sm:col-span-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save address"}
        </Button>
      </div>
    </form>
  );
}
