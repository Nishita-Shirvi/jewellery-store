"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { saveStorefrontSettingsAction } from "@/app/admin/storefront-actions";
import type { AdminFormState } from "@/app/admin/actions";
import type { StorefrontSettings } from "@/lib/validation/storefront";

export function StorefrontSettingsForm({ values }: { values: StorefrontSettings }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(
    saveStorefrontSettingsAction,
    {},
  );
  const e = state.fieldErrors ?? {};
  const v = { ...values, ...(state.values ?? {}) } as Record<string, string>;
  return (
    <form action={action} className="grid max-w-2xl gap-4" noValidate aria-label="Showroom">
      {(state.error || state.message) && (
        <p
          role={state.error ? "alert" : "status"}
          className={`rounded-md border p-3 text-sm ${state.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          {state.error ?? state.message}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="showroomAddress">Showroom address</Label>
        <textarea
          id="showroomAddress"
          name="showroomAddress"
          defaultValue={v.showroomAddress}
          rows={3}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
        {e.showroomAddress && <p className="text-xs text-red-700">{e.showroomAddress[0]}</p>}
      </div>
      <FormField
        label="Opening hours"
        name="hours"
        defaultValue={v.hours}
        errors={e.hours}
        hint="e.g. Monday–Saturday, 10 am – 7 pm; Sunday closed"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Showroom phone"
          name="phone"
          defaultValue={v.phone}
          errors={e.phone}
          inputMode="tel"
        />
        <FormField
          label="WhatsApp number"
          name="whatsapp"
          defaultValue={v.whatsapp}
          errors={e.whatsapp}
          inputMode="tel"
          hint="Powers the “Ask on WhatsApp” button. Empty hides it."
        />
      </div>
      <FormField
        label="Google Maps link"
        name="mapUrl"
        defaultValue={v.mapUrl}
        errors={e.mapUrl}
        hint="Google Maps → your shop → Share → Copy link."
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
