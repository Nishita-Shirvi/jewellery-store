"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveVariantOptionsAction,
  saveVariantsAction,
  type AdminFormState,
} from "@/app/admin/actions";
import { MAX_OPTIONS, MAX_VARIANTS } from "@/lib/variants";

function Banner({ state }: { state: AdminFormState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={
        state.error
          ? "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          : "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
      }
    >
      {state.error ?? state.message}
    </p>
  );
}

/** Up to 3 options, each with a comma-separated list of values. */
export function OptionsForm({
  productId,
  options,
}: {
  productId: string;
  options: { name: string; values: string[] }[];
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(
    saveVariantOptionsAction,
    {},
  );
  const rows = Array.from({ length: MAX_OPTIONS }, (_, i) => options[i]);
  return (
    <form action={action} className="space-y-4" aria-label="Options">
      <input type="hidden" name="productId" value={productId} />
      <Banner state={state} />
      {rows.map((o, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`option${i}Name`}>Option {i + 1} name</Label>
            <Input
              id={`option${i}Name`}
              name={`option${i}Name`}
              placeholder={i === 0 ? "Ring size" : i === 1 ? "Metal colour" : ""}
              defaultValue={state.values?.[`option${i}Name`] ?? o?.name ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`option${i}Values`}>Values (comma separated)</Label>
            <Input
              id={`option${i}Values`}
              name={`option${i}Values`}
              placeholder={i === 0 ? "10, 12, 14" : i === 1 ? "Yellow, Rose" : ""}
              defaultValue={state.values?.[`option${i}Values`] ?? o?.values.join(", ") ?? ""}
            />
          </div>
        </div>
      ))}
      <p className="text-muted-foreground text-xs">
        Saving creates every missing combination (stock 0, current price and weight) — up to{" "}
        {MAX_VARIANTS}. Combinations you remove are switched off, never deleted, so past orders stay
        intact. Leave all options empty to sell the piece without options again.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save options & create combinations"}
      </Button>
    </form>
  );
}

export interface VariantRow {
  id: string;
  sku: string;
  label: string;
  price: string;
  stock: number;
  reserved: number;
  net: string;
  gross: string;
  isActive: boolean;
  orders: number;
}

/** Bulk edit grid: SKU, price, stock, weights and on/off for every variant. */
export function VariantsGrid({ productId, rows }: { productId: string; rows: VariantRow[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveVariantsAction, {});
  const v = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  return (
    <form action={action} className="space-y-4" aria-label="Variants">
      <input type="hidden" name="productId" value={productId} />
      <Banner state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="setAllPrice">Set every price to (₹)</Label>
          <Input id="setAllPrice" name="setAllPrice" inputMode="decimal" className="w-40" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="setAllStock">Set every stock to</Label>
          <Input id="setAllStock" name="setAllStock" inputMode="numeric" className="w-32" />
        </div>
        <p className="text-muted-foreground pb-2 text-xs">Leave empty to use the values below.</p>
      </div>
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2">Variant</th>
              <th className="p-2">SKU</th>
              <th className="p-2">Price (₹)</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Net g</th>
              <th className="p-2">Gross g</th>
              <th className="p-2">On sale</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "text-muted-foreground"}>
                <td className="p-2">
                  <input type="hidden" name="variantId" value={r.id} />
                  {r.label || "Base (no options)"}
                  {r.reserved > 0 && (
                    <span className="block text-xs text-amber-700">
                      {r.reserved} held in checkouts
                    </span>
                  )}
                  {r.orders > 0 && <span className="block text-xs">{r.orders} order line(s)</span>}
                </td>
                <td className="p-2">
                  <Input
                    name={`sku_${r.id}`}
                    aria-label={`SKU for ${r.label || "base"}`}
                    defaultValue={v(`sku_${r.id}`, r.sku)}
                    className="h-8 w-56 font-mono uppercase"
                  />
                </td>
                <td className="p-2">
                  <Input
                    name={`price_${r.id}`}
                    aria-label={`Price for ${r.label || "base"}`}
                    inputMode="decimal"
                    defaultValue={v(`price_${r.id}`, r.price)}
                    className="h-8 w-28"
                  />
                </td>
                <td className="p-2">
                  <Input
                    name={`stock_${r.id}`}
                    aria-label={`Stock for ${r.label || "base"}`}
                    inputMode="numeric"
                    defaultValue={v(`stock_${r.id}`, String(r.stock))}
                    className="h-8 w-20"
                  />
                </td>
                <td className="p-2">
                  <Input
                    name={`net_${r.id}`}
                    aria-label={`Net weight for ${r.label || "base"}`}
                    inputMode="decimal"
                    defaultValue={v(`net_${r.id}`, r.net)}
                    className="h-8 w-20"
                  />
                </td>
                <td className="p-2">
                  <Input
                    name={`gross_${r.id}`}
                    aria-label={`Gross weight for ${r.label || "base"}`}
                    inputMode="decimal"
                    defaultValue={v(`gross_${r.id}`, r.gross)}
                    className="h-8 w-20"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="checkbox"
                    name={`active_${r.id}`}
                    aria-label={`On sale: ${r.label || "base"}`}
                    defaultChecked={r.isActive}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save variants"}
      </Button>
    </form>
  );
}
