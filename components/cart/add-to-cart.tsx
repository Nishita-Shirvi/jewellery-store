"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/app/cart/actions";
import { MAX_QTY_PER_ITEM } from "@/lib/validation/cart";
import { track } from "@/components/analytics/analytics";

/** Quantity selector + Add to Cart. The server re-checks price and stock every time. */
export function AddToCart({ productId, stock }: { productId: string; stock: number }) {
  const max = Math.max(0, Math.min(stock, MAX_QTY_PER_ITEM));
  const [quantity, setQuantity] = useState(1);
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
    startTransition(async () => {
      const res = await addToCartAction({ productId, quantity });
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
