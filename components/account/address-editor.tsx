"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { saveAddressAction, type AccountFormState } from "@/app/account/actions";
import { INDIAN_STATES } from "@/lib/india";

export interface EditableAddress {
  id?: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
}

const EMPTY: EditableAddress = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  landmark: "",
  city: "",
  state: "",
  pincode: "",
};

/** Add or edit an address on the account page. */
export function AddressEditor({
  address,
  triggerLabel,
}: {
  address?: EditableAddress;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<AccountFormState, FormData>(
    saveAddressAction,
    {},
  );
  const values = address ?? EMPTY;
  const e = state.fieldErrors ?? {};
  const prefix = values.id ? `a-${values.id}-` : "a-new-";

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border grid w-full gap-4 rounded-md border p-4 sm:grid-cols-2"
      noValidate
      aria-label={values.id ? "Edit address" : "New address"}
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {state.error && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      <FormField
        label="Full name"
        name="fullName"
        id={`${prefix}fullName`}
        defaultValue={values.fullName}
        errors={e.fullName}
      />
      <FormField
        label="Mobile number"
        name="phone"
        id={`${prefix}phone`}
        type="tel"
        defaultValue={values.phone}
        errors={e.phone}
      />
      <div className="sm:col-span-2">
        <FormField
          label="House / flat, street"
          name="line1"
          id={`${prefix}line1`}
          defaultValue={values.line1}
          errors={e.line1}
        />
      </div>
      <div className="sm:col-span-2">
        <FormField
          label="Area, colony (optional)"
          name="line2"
          id={`${prefix}line2`}
          defaultValue={values.line2}
          errors={e.line2}
        />
      </div>
      <FormField
        label="Landmark (optional)"
        name="landmark"
        id={`${prefix}landmark`}
        defaultValue={values.landmark}
        errors={e.landmark}
      />
      <FormField
        label="City"
        name="city"
        id={`${prefix}city`}
        defaultValue={values.city}
        errors={e.city}
      />
      <div className="space-y-1.5">
        <Label htmlFor={`${prefix}state`}>State</Label>
        <select
          id={`${prefix}state`}
          name="state"
          defaultValue={values.state}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
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
        id={`${prefix}pincode`}
        inputMode="numeric"
        maxLength={6}
        defaultValue={values.pincode}
        errors={e.pincode}
      />
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save address"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
