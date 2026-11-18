"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import { saveRatesAction } from "@/app/admin/storefront-actions";
import type { AdminFormState } from "@/app/admin/actions";

export interface RateRow {
  purity: string;
  label: string;
  /** Current rate in rupees per gram, "" when none yet. */
  current: string;
  updated: string | null;
  linkedProducts: number;
}

export function RatesForm({ rows, largePercent }: { rows: RateRow[]; largePercent: number }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveRatesAction, {});
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate aria-label="Metal rates">
      {(state.error || state.message) && (
        <p
          role={state.error ? "alert" : "status"}
          className={`rounded-md border p-3 text-sm ${state.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
        >
          {state.error ?? state.message}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.purity} className="border-border rounded-md border p-4">
            <FormField
              label={`${r.label} — ₹ per gram`}
              name={r.purity}
              inputMode="decimal"
              placeholder={r.current || "Not set"}
              defaultValue={v[r.purity] ?? ""}
              errors={e[r.purity]}
              hint={
                r.current
                  ? `Now ₹${r.current}/g${r.updated ? `, set ${r.updated}` : ""}`
                  : "No rate yet"
              }
            />
            <p className="text-muted-foreground mt-2 text-xs">
              {r.linkedProducts} rate-linked {r.linkedProducts === 1 ? "piece" : "pieces"}
            </p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-sm">
        Leave a box empty to keep its current rate. Saving recalculates the price of every
        rate-linked piece of that purity straight away. Customers paying at that moment are asked to
        review their cart.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmLarge" className="mt-1" />
        <span>
          Yes, these rates are correct (needed when a rate moves more than {largePercent}% — check
          you typed the rate per <strong>gram</strong>, not per 10 g).
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save rates"}
      </Button>
    </form>
  );
}
