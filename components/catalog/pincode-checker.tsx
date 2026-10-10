"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkPincodeAction } from "@/app/products/actions";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function PincodeChecker() {
  const [pincode, setPincode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function check(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const res = await checkPincodeAction(pincode);
      if (res.status === "invalid")
        setMessage({ ok: false, text: "Enter a valid 6-digit pincode." });
      else if (res.status === "rate_limited")
        setMessage({ ok: false, text: "Too many checks. Try again in a minute." });
      else if (res.status === "not_serviceable")
        setMessage({ ok: false, text: `Sorry, we don't deliver to ${pincode} yet.` });
      else if (res.status === "serviceable") {
        const days = res.etdDays ? res.etdDays + 2 : null; // + dispatch time
        setMessage({
          ok: true,
          text: days
            ? `Delivers to ${pincode} by ${dateFmt.format(new Date(Date.now() + days * 86_400_000))}.`
            : `We deliver to ${pincode}.`,
        });
      } else
        setMessage({
          ok: true,
          text: "We deliver across India. Exact dates are confirmed at dispatch.",
        });
    });
  }

  return (
    <form onSubmit={check} className="space-y-2" aria-label="Check delivery">
      <label htmlFor="pincode-check" className="text-sm font-medium">
        Check delivery
      </label>
      <div className="flex max-w-xs gap-2">
        <Input
          id="pincode-check"
          inputMode="numeric"
          maxLength={6}
          placeholder="Pincode"
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
        />
        <Button type="submit" variant="outline" disabled={pending || pincode.length !== 6}>
          {pending ? "Checking…" : "Check"}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`min-h-5 text-sm ${message?.ok === false ? "text-red-700" : "text-emerald-700"}`}
      >
        {message?.text}
      </p>
    </form>
  );
}
