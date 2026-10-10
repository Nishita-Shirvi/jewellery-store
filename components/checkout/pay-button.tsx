"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  retryPaymentAction,
  startCheckoutAction,
  verifyPaymentAction,
} from "@/app/checkout/actions";
import type { CheckoutResult } from "@/services/order.service";
import { loadRazorpay, openRazorpay } from "./razorpay";

interface PayButtonProps {
  label: string;
  storeName: string;
  /** New checkout: needs an address. Retry: pass orderId instead. */
  addressId?: string | null;
  orderId?: string;
  disabled?: boolean;
}

export function PayButton({ label, storeName, addressId, orderId, disabled }: PayButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // One key per page visit: double clicks and retries reuse the same order.
  const checkoutKey = useRef<string>(crypto.randomUUID());
  const activeOrderId = useRef<string | undefined>(orderId);

  function pay() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    startTransition(async () => {
      const result: CheckoutResult = activeOrderId.current
        ? await retryPaymentAction({ orderId: activeOrderId.current })
        : addressId
          ? await startCheckoutAction({ addressId, checkoutKey: checkoutKey.current })
          : { ok: false, error: "Please choose a delivery address." };

      if (!result.ok) {
        setMessage(result.error);
        setBusy(false);
        return;
      }
      const session = result.session;
      activeOrderId.current = session.orderId;

      if (!(await loadRazorpay())) {
        setMessage("Couldn't load the payment window. Check your connection and try again.");
        setBusy(false);
        return;
      }

      openRazorpay({
        keyId: session.keyId,
        razorpayOrderId: session.razorpayOrderId,
        amountInPaise: session.amountInPaise,
        storeName,
        prefill: session.prefill,
        onSuccess: async (response) => {
          setMessage("Confirming your payment…");
          const verified = await verifyPaymentAction({ orderId: session.orderId, ...response });
          if (verified.ok) router.push(verified.redirectTo);
          else {
            setMessage(verified.error);
            setBusy(false);
          }
        },
        onDismiss: () => {
          setMessage("Payment cancelled. Your order is saved — you can try again.");
          setBusy(false);
        },
        onFailure: (description) => {
          router.push(
            `/orders/${session.orderId}/failed?reason=${encodeURIComponent(description.slice(0, 120))}`,
          );
        },
      });
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" className="w-full" onClick={pay} disabled={disabled || busy || pending}>
        {busy || pending ? "Please wait…" : label}
      </Button>
      <p role="status" aria-live="polite" className="text-muted-foreground min-h-5 text-sm">
        {message}
      </p>
    </div>
  );
}
