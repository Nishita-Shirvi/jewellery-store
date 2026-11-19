import { BadgeCheck, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { RETURN_WINDOW_DAYS } from "@/lib/returns";
import { cn } from "@/lib/utils";

/**
 * The four promises a jewellery buyer looks for before paying (cart, checkout). Plain text,
 * no claims beyond what the shop's settings and policies actually say.
 */
export function TrustNotes({ className, compact }: { className?: string; compact?: boolean }) {
  const items = [
    { icon: BadgeCheck, title: "BIS hallmarked", text: "Every gold piece carries its HUID." },
    { icon: Truck, title: "Insured shipping", text: "Packed tamper-proof, insured to your door." },
    {
      icon: RotateCcw,
      title: `${RETURN_WINDOW_DAYS}-day returns`,
      text: "Unworn pieces, refunded to your payment method.",
    },
    { icon: ShieldCheck, title: "Secure payment", text: "Cards, UPI and netbanking via Razorpay." },
  ];
  return (
    <ul className={cn("grid gap-3 text-sm", compact ? "" : "sm:grid-cols-2", className)}>
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-start gap-3">
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#8a6420]" />
          <span>
            <span className="font-medium">{title}</span>
            <span className="text-muted-foreground block text-xs">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "₹1,200 more for free shipping" as a bar; full when shipping is already free. */
export function FreeShippingMeter({
  subtotalInPaise,
  freeAboveInPaise,
  remainingLabel,
}: {
  subtotalInPaise: number;
  freeAboveInPaise: number;
  remainingLabel: string | null;
}) {
  if (freeAboveInPaise <= 0) return null;
  const pct = Math.min(100, Math.round((subtotalInPaise / freeAboveInPaise) * 100));
  return (
    <div className="space-y-1.5">
      <p className="text-sm">
        {remainingLabel ? (
          <>
            Add <strong>{remainingLabel}</strong> more for free insured shipping
          </>
        ) : (
          <span className="text-emerald font-medium">Your order ships free</span>
        )}
      </p>
      <div
        className="bg-muted h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Progress to free shipping"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#c9a45c] to-[#a87a28] transition-[width] motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
