"use client";

/** Loads Razorpay's checkout script once. */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ((window as unknown as { Razorpay?: unknown }).Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay]");
    const script = existing ?? document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    if (!existing) document.body.appendChild(script);
  });
}

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(
    event: "payment.failed",
    handler: (response: { error?: { description?: string } }) => void,
  ): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

export function openRazorpay(options: {
  keyId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  storeName: string;
  prefill: { name: string; email: string; contact: string };
  onSuccess: (response: RazorpaySuccess) => void;
  onDismiss: () => void;
  onFailure: (description: string) => void;
}) {
  const Razorpay = (window as unknown as { Razorpay: RazorpayConstructor }).Razorpay;
  const rzp = new Razorpay({
    key: options.keyId,
    order_id: options.razorpayOrderId,
    amount: options.amountInPaise,
    currency: "INR",
    name: options.storeName,
    prefill: options.prefill,
    theme: { color: "#262626" },
    handler: options.onSuccess,
    modal: { ondismiss: options.onDismiss, confirm_close: true },
  });
  rzp.on("payment.failed", (r) => options.onFailure(r.error?.description ?? "Payment failed"));
  rzp.open();
}
