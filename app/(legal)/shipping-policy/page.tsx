import type { Metadata } from "next";
import { POLICY_LAST_UPDATED, getBusiness } from "@/lib/business";

export const metadata: Metadata = { title: "Shipping policy" };

export default function ShippingPolicyPage() {
  const b = getBusiness();
  return (
    <>
      <h1>Shipping policy</h1>
      <p className="text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>
      <h2>Where we ship</h2>
      <p>
        We ship across India to all serviceable pincodes. We don&apos;t ship outside India at the
        moment.
      </p>
      <h2>Shipping charges</h2>
      <p>
        Shipping is currently free on all orders. Any shipping charge will always be shown at
        checkout before you pay.
      </p>
      <h2>Dispatch and delivery time</h2>
      <ul>
        <li>Orders are packed and dispatched within 2–4 business days of payment.</li>
        <li>
          Delivery usually takes 3–7 business days after dispatch, depending on your location.
        </li>
        <li>
          You&apos;ll receive an email when your order ships, and you can follow its status in your
          account.
        </li>
      </ul>
      <h2>Safe, insured delivery</h2>
      <p>
        Every order is sent in tamper-evident packaging and is fully insured until it reaches you.
        Please don&apos;t accept a parcel that looks opened or damaged — refuse it and contact us.
      </p>
      <h2>Questions</h2>
      <p>
        Write to {b.email} or call {b.phone}.
      </p>
    </>
  );
}
