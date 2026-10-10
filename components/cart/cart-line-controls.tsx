"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeItemAction, updateQuantityAction } from "@/app/cart/actions";

export function CartLineControls({
  productId,
  name,
  quantity,
  maxQuantity,
}: {
  productId: string;
  name: string;
  quantity: number;
  maxQuantity: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(next: number) {
    setError(null);
    startTransition(async () => {
      const res = await updateQuantityAction({ productId, quantity: next });
      if (!res.ok) setError(res.error);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await removeItemAction({ productId });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {maxQuantity > 0 && (
          <div
            className="border-input flex items-center rounded-md border"
            role="group"
            aria-label={`Quantity of ${name}`}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Decrease quantity of ${name}`}
              disabled={pending || quantity <= 1}
              onClick={() => change(quantity - 1)}
            >
              <Minus />
            </Button>
            <output className="w-8 text-center text-sm tabular-nums">{quantity}</output>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Increase quantity of ${name}`}
              disabled={pending || quantity >= maxQuantity}
              onClick={() => change(quantity + 1)}
            >
              <Plus />
            </Button>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove ${name}`}
        >
          <Trash2 />
          <span>Remove</span>
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
