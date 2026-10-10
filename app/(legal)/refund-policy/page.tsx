import type { Metadata } from "next";
import { POLICY_LAST_UPDATED, getBusiness } from "@/lib/business";

export const metadata: Metadata = { title: "Refunds and cancellations" };

export default function RefundPolicyPage() {
  const b = getBusiness();
  return (
    <>
      <h1>Refunds and cancellations</h1>
      <p className="text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>
      <h2>Cancelling an order</h2>
      <p>
        You can cancel an order any time before it is shipped. You&apos;ll get a full refund to your
        original payment method.
      </p>
      <h2>Returns</h2>
      <ul>
        <li>
          Returnable pieces can be returned within 7 days of delivery. Each product page says
          whether the piece is returnable.
        </li>
        <li>
          The piece must be unused and in its original condition and packaging, with all tags,
          certificates and the invoice.
        </li>
        <li>
          Customised, engraved or resized pieces cannot be returned, unless they arrive damaged or
          different from what you ordered.
        </li>
      </ul>
      <h2>Refunds</h2>
      <ul>
        <li>Once we receive and check a return, we approve it within 2 business days.</li>
        <li>
          Refunds go back to the original payment method within 5–7 business days of approval.
        </li>
        <li>
          If a piece sells out after you&apos;ve paid, we cancel the order and refund you in full
          automatically.
        </li>
      </ul>
      <h2>Damaged or wrong item</h2>
      <p>
        Contact us within 48 hours of delivery with photos and we&apos;ll arrange a replacement or
        full refund at no cost to you.
      </p>
      <h2>Contact</h2>
      <p>
        {b.email} · {b.phone}
      </p>
    </>
  );
}
