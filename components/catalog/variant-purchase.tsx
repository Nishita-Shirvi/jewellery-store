"use client";

import { useMemo, useState } from "react";
import { AddToCart } from "@/components/cart/add-to-cart";
import { NotifyMe } from "@/components/marketing/marketing-forms";
import { formatINR } from "@/lib/format";
import { stockStatus } from "@/lib/jewellery";
import { cn } from "@/lib/utils";
import type { OptionView, VariantView } from "@/types/catalog";

const toneClass = { ok: "text-emerald-700", low: "text-amber-700", out: "text-red-700" } as const;

/**
 * Option pickers (e.g. Ring size, Metal colour) + price/stock of the chosen variant + Add to cart.
 * A combination that doesn't exist or is sold out is shown but can't be bought; the server checks
 * the variant, its price and its stock again on every add and at checkout.
 */
export function VariantPurchase({
  productId,
  options,
  variants,
  viewerEmail,
}: {
  productId: string;
  options: OptionView[];
  variants: VariantView[];
  viewerEmail?: string | null;
}) {
  const first = variants.find((v) => v.available > 0) ?? variants[0];
  const [chosen, setChosen] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const o of options) {
      const hit = o.values.find((val) => first?.optionValueIds.includes(val.id));
      if (hit) start[o.id] = hit.id;
    }
    return start;
  });

  const selected = useMemo(() => {
    const ids = Object.values(chosen);
    if (ids.length !== options.length) return undefined;
    return variants.find((v) => ids.every((id) => v.optionValueIds.includes(id)));
  }, [chosen, options.length, variants]);

  /** Is there any buyable variant with this value, given the other choices? */
  function valueBuyable(optionId: string, valueId: string): boolean {
    const others = Object.entries(chosen).filter(([o]) => o !== optionId);
    return variants.some(
      (v) =>
        v.available > 0 &&
        v.optionValueIds.includes(valueId) &&
        others.every(([, id]) => v.optionValueIds.includes(id)),
    );
  }

  const stock = stockStatus(selected?.available ?? 0);

  return (
    <div className="space-y-5">
      {options.map((o) => (
        <fieldset key={o.id}>
          <legend className="text-sm font-medium">{o.name}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {o.values.map((val) => {
              const active = chosen[o.id] === val.id;
              const buyable = valueBuyable(o.id, val.id);
              return (
                <label
                  key={val.id}
                  className={cn(
                    "relative cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2",
                    active ? "border-foreground bg-foreground text-background" : "border-input",
                    !buyable && !active && "text-muted-foreground line-through",
                  )}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`option-${o.id}`}
                    value={val.id}
                    checked={active}
                    onChange={() => setChosen((c) => ({ ...c, [o.id]: val.id }))}
                  />
                  {val.value}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div>
        <p className="text-2xl font-semibold" data-testid="variant-price">
          {selected ? formatINR(selected.priceInPaise) : "—"}
        </p>
        <p className="text-muted-foreground text-xs">Inclusive of all taxes</p>
        {selected && (
          <p className="text-muted-foreground mt-1 text-xs" data-testid="variant-details">
            {selected.materialSummary} · SKU {selected.sku}
          </p>
        )}
        <p className={cn("mt-3 text-sm font-medium", toneClass[stock.tone])} role="status">
          {selected ? stock.label : "This combination isn't available"}
        </p>
      </div>

      {/* key: a new variant starts again at quantity 1 */}
      <AddToCart
        key={selected?.id ?? "none"}
        productId={productId}
        variantId={selected?.id}
        stock={selected?.available ?? 0}
      />
      {selected && selected.available === 0 && (
        <NotifyMe key={selected.id} variantId={selected.id} email={viewerEmail} />
      )}
    </div>
  );
}
