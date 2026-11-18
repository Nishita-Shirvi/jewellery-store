"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/app/cart/actions";
import { MAX_QTY_PER_ITEM } from "@/lib/validation/cart";
import { track } from "@/components/analytics/analytics";

/** Quantity selector + Add to Cart. The server re-checks price and stock every time. */
export function AddToCart({
  productId,
  stock,
  sizes = [],
}: {
  productId: string;
  stock: number;
  /** When not empty, the customer must choose one before adding. */
  sizes?: string[];
}) {
  const max = Math.max(0, Math.min(stock, MAX_QTY_PER_ITEM));
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (max === 0) {
    return (
      <Button className="w-full sm:w-auto" disabled>
        Out of stock
      </Button>
    );
  }

  function add() {
    setResult(null);
    if (sizes.length > 0 && !size) {
      setResult({ ok: false, text: "Please choose a size." });
      return;
    }
    startTransition(async () => {
      const res = await addToCartAction({ productId, quantity, size });
      setResult(
        res.ok
          ? { ok: true, text: res.message ?? "Added to cart." }
          : { ok: false, text: res.error },
      );
      if (res.ok)
        track("add_to_cart", { currency: "INR", items: [{ item_id: productId, quantity }] });
    });
  }

  return (
    <div className="space-y-3">
      {sizes.length > 0 && (
        <fieldset>
          <legend className="flex w-full items-baseline justify-between gap-3 text-sm font-medium">
            <span>Size{size ? `: ${size}` : ""}</span>
            <Link href="/size-guide" className="text-xs font-normal underline underline-offset-4">
              Size guide
            </Link>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <label
                key={s}
                className="has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground border-input has-[:focus-visible]:ring-ring flex h-9 min-w-10 cursor-pointer items-center justify-center rounded-md border px-3 text-sm has-[:focus-visible]:ring-2"
              >
                <input
                  type="radio"
                  name="size"
                  value={s}
                  checked={size === s}
                  onChange={() => setSize(s)}
                  className="sr-only"
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="border-input flex items-center rounded-md border"
          role="group"
          aria-label="Quantity"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Decrease quantity"
            disabled={quantity <= 1 || pending}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Minus />
          </Button>
          <output className="w-8 text-center text-sm tabular-nums" aria-live="polite">
            {quantity}
          </output>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Increase quantity"
            disabled={quantity >= max || pending}
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
          >
            <Plus />
          </Button>
        </div>
        <Button type="button" className="min-w-40" onClick={add} disabled={pending}>
          {pending ? "Adding…" : "Add to cart"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {result &&
          (result.ok ? (
            <span className="text-emerald-700">
              {result.text}{" "}
              <Link href="/cart" className="font-medium underline underline-offset-4">
                View cart
              </Link>
            </span>
          ) : (
            <span className="text-red-700">{result.text}</span>
          ))}
      </p>
    </div>
  );
}
