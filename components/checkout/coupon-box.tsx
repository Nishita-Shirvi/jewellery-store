"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyCouponAction, type CouponCheck } from "@/app/checkout/actions";

export function CouponBox({
  onChange,
}: {
  onChange: (applied: Extract<CouponCheck, { ok: true }> | null) => void;
}) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<Extract<CouponCheck, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await applyCouponAction(code);
      if (res.ok) {
        setApplied(res);
        onChange(res);
      } else {
        setError(res.error);
        onChange(null);
      }
    });
  }

  if (applied) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <span>
          <strong>{applied.code}</strong> applied · {applied.description}
        </span>
        <button
          type="button"
          className="underline"
          onClick={() => {
            setApplied(null);
            setCode("");
            onChange(null);
          }}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={apply} className="space-y-1" aria-label="Coupon">
      <div className="flex max-w-sm gap-2">
        <Input
          aria-label="Coupon code"
          placeholder="Coupon code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={32}
        />
        <Button type="submit" variant="outline" disabled={pending || !code.trim()}>
          {pending ? "Checking…" : "Apply"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
