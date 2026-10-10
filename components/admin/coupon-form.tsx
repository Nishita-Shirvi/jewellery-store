"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { saveCouponAction, type AdminFormState } from "@/app/admin/actions";

export interface CouponFormValues {
  id?: string;
  code: string;
  type: "PERCENT" | "FLAT";
  value: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perUserLimit: string;
  isActive: boolean;
}

export function CouponForm({ values }: { values: CouponFormValues }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveCouponAction, {});
  // After an error React resets the form; feeding back what was typed keeps the admin's input.
  const typed = state.values ?? {};
  const v = (key: keyof CouponFormValues) => typed[key] ?? String(values[key] ?? "");
  const [type, setType] = useState(values.type);
  const e = state.fieldErrors ?? {};
  return (
    <form
      action={action}
      className="grid max-w-2xl gap-4 sm:grid-cols-2"
      noValidate
      aria-label="Coupon"
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {(state.error || state.message) && (
        <p
          role={state.error ? "alert" : "status"}
          className={`rounded-md border p-3 text-sm sm:col-span-2 ${state.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          {state.error ?? state.message}
        </p>
      )}
      <FormField
        label="Code"
        name="code"
        defaultValue={v("code")}
        errors={e.code}
        hint="Customers can type it in any case."
      />
      <div className="space-y-1.5">
        <Label htmlFor="type">Type</Label>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(ev) => setType(ev.target.value as "PERCENT" | "FLAT")}
          className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
        >
          <option value="PERCENT">Percent off</option>
          <option value="FLAT">Flat amount off</option>
        </select>
      </div>
      <FormField
        label={type === "PERCENT" ? "Percent off (1–90)" : "Amount off (₹)"}
        name="value"
        inputMode="decimal"
        defaultValue={v("value")}
        errors={e.value}
      />
      {type === "PERCENT" ? (
        <FormField
          label="Maximum discount (₹, optional)"
          name="maxDiscount"
          inputMode="decimal"
          defaultValue={v("maxDiscount")}
          errors={e.maxDiscount}
        />
      ) : (
        <div />
      )}
      <FormField
        label="Minimum order (₹, optional)"
        name="minOrder"
        inputMode="decimal"
        defaultValue={v("minOrder")}
        errors={e.minOrder}
      />
      <div />
      <FormField
        label="Starts (optional, India time)"
        name="startsAt"
        type="datetime-local"
        defaultValue={v("startsAt")}
        errors={e.startsAt}
      />
      <FormField
        label="Ends (optional, India time)"
        name="endsAt"
        type="datetime-local"
        defaultValue={v("endsAt")}
        errors={e.endsAt}
      />
      <FormField
        label="Total uses allowed (optional)"
        name="usageLimit"
        inputMode="numeric"
        defaultValue={v("usageLimit")}
        errors={e.usageLimit}
        hint="Empty = unlimited"
      />
      <FormField
        label="Uses per customer (optional)"
        name="perUserLimit"
        inputMode="numeric"
        defaultValue={v("perUserLimit")}
        errors={e.perUserLimit}
        hint="Empty = unlimited"
      />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked={values.isActive} /> Active
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Create coupon"}
        </Button>
      </div>
    </form>
  );
}
