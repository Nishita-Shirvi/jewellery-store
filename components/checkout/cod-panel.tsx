"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  codQuoteAction,
  placeCodOrderAction,
  sendCodOtpAction,
  type CodQuoteResult,
} from "@/app/checkout/actions";
import { formatINR } from "@/lib/format";

/**
 * Cash on delivery: shows whether COD is possible for this address/cart, sends an SMS code,
 * then places the order. The server re-checks every rule when the order is placed.
 */
export function CodPanel({
  addressId,
  couponCode,
}: {
  addressId: string | null;
  couponCode?: string;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState<CodQuoteResult | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; sentTo: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // One key per address/coupon: a double click places one order, a change starts a new one.
  const checkoutKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    checkoutKey.current = crypto.randomUUID();
    setChallenge(null);
    setCode("");
    setMessage(null);
    setQuote(null);
    if (!addressId) return;
    let live = true;
    codQuoteAction({ addressId, couponCode }).then((q) => live && setQuote(q));
    return () => {
      live = false;
    };
  }, [addressId, couponCode]);

  if (!addressId)
    return <p className="text-muted-foreground text-sm">Add or choose an address first.</p>;
  if (!quote) return <p className="text-muted-foreground text-sm">Checking cash on delivery…</p>;
  if (!quote.ok)
    return (
      <p role="status" className="text-sm text-amber-800" data-testid="cod-unavailable">
        {quote.reason}
      </p>
    );

  function sendCode() {
    setMessage(null);
    startTransition(async () => {
      const res = await sendCodOtpAction({ addressId: addressId!, couponCode });
      if (res.ok) setChallenge({ id: res.challengeId, sentTo: res.sentTo });
      else setMessage(res.error);
    });
  }

  function place() {
    setMessage(null);
    startTransition(async () => {
      const res = await placeCodOrderAction({
        addressId: addressId!,
        checkoutKey: checkoutKey.current,
        couponCode,
        ...(quote?.ok && quote.otpRequired ? { challengeId: challenge?.id, code } : {}),
      });
      if (res.ok) router.push(`/orders/${res.orderId}/success`);
      else setMessage(res.error);
    });
  }

  const placeLabel = `Place order · pay ${formatINR(quote.totalInPaise)} on delivery`;
  return (
    <div className="space-y-3">
      <p className="text-sm" data-testid="cod-total">
        Pay {formatINR(quote.totalInPaise)} in cash or UPI to the courier
        {quote.feeInPaise > 0 ? ` (includes ${formatINR(quote.feeInPaise)} COD fee)` : ""}.
      </p>
      {quote.otpRequired && !challenge && (
        <Button type="button" variant="outline" onClick={sendCode} disabled={pending}>
          {pending ? "Sending…" : "Send code to my mobile"}
        </Button>
      )}
      {quote.otpRequired && challenge && (
        <div className="space-y-1.5">
          <Label htmlFor="cod-code">Code sent to {challenge.sentTo}</Label>
          <div className="flex gap-2">
            <Input
              id="cod-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-32 tracking-widest"
            />
            <Button type="button" variant="ghost" size="sm" onClick={sendCode} disabled={pending}>
              Send again
            </Button>
          </div>
        </div>
      )}
      {(!quote.otpRequired || challenge) && (
        <Button
          type="button"
          className="w-full"
          onClick={place}
          disabled={pending || (quote.otpRequired && code.length !== 6)}
        >
          {pending ? "Placing order…" : placeLabel}
        </Button>
      )}
      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-red-700">
        {message}
      </p>
    </div>
  );
}
