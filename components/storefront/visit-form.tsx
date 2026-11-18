"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { requestVisitAction, type VisitFormState } from "@/app/visit/actions";
import { VISIT_SLOTS } from "@/lib/storefront";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

export function VisitForm({
  productSlug,
  productName,
  minDate,
  maxDate,
  defaults,
}: {
  productSlug?: string;
  productName?: string;
  minDate: string;
  maxDate: string;
  defaults: { name: string; email: string };
}) {
  const [state, action, pending] = useActionState<VisitFormState, FormData>(requestVisitAction, {});
  if (state.ok) {
    return (
      <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-6">
        <CheckCircle2 className="size-6 text-emerald-700" aria-hidden="true" />
        <p className="mt-2 font-medium">Thank you — we&apos;ve got your request.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          We&apos;ll call you to confirm the time. If your plans change, just let us know.
        </p>
      </div>
    );
  }
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form
      action={action}
      className="grid gap-4 sm:grid-cols-2"
      noValidate
      aria-label="Book a visit"
    >
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 sm:col-span-2"
        >
          {state.error}
        </p>
      )}
      {productSlug && (
        <>
          <input type="hidden" name="productSlug" value={productSlug} />
          <p className="bg-muted rounded-md p-3 text-sm sm:col-span-2">
            We&apos;ll keep <strong>{productName}</strong> ready for you.
          </p>
        </>
      )}
      {/* Honeypot: hidden from people, bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <FormField
        label="Your name"
        name="name"
        autoComplete="name"
        defaultValue={v.name ?? defaults.name}
        errors={e.name}
      />
      <FormField
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        defaultValue={v.phone}
        errors={e.phone}
        hint="We'll call to confirm. Never shared."
      />
      <FormField
        label="Email (optional)"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={v.email ?? defaults.email}
        errors={e.email}
      />
      <FormField
        label="Preferred date"
        name="preferredDate"
        type="date"
        min={minDate}
        max={maxDate}
        defaultValue={v.preferredDate}
        errors={e.preferredDate}
      />
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="timeSlot">Preferred time</Label>
        <select
          id="timeSlot"
          name="timeSlot"
          defaultValue={v.timeSlot ?? VISIT_SLOTS[0]}
          className={selectClass}
        >
          {VISIT_SLOTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {e.timeSlot && <p className="text-xs text-red-700">{e.timeSlot[0]}</p>}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="message">Anything we should know? (optional)</Label>
        <textarea
          id="message"
          name="message"
          rows={3}
          maxLength={500}
          defaultValue={v.message}
          placeholder="e.g. looking for a bridal set, budget around ₹2 lakh"
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Sending…" : "Request a visit"}
        </Button>
      </div>
    </form>
  );
}
