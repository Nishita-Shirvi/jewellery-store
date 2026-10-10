import type { Metadata } from "next";
import { POLICY_LAST_UPDATED, getBusiness } from "@/lib/business";

export const metadata: Metadata = { title: "Terms and conditions" };

export default function TermsPage() {
  const b = getBusiness();
  return (
    <>
      <h1>Terms and conditions</h1>
      <p className="text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>
      <p>
        These terms apply to purchases from {b.storeName}, operated by {b.legalName}, {b.address}{" "}
        (GSTIN {b.gstin}). By placing an order you agree to them.
      </p>
      <h2>Products and prices</h2>
      <ul>
        <li>All prices are in Indian Rupees and include GST.</li>
        <li>
          We describe metal, purity, weight and stones as accurately as possible. Small variations
          in weight and natural stones are normal for handcrafted jewellery.
        </li>
        <li>Gold jewellery carries BIS hallmarking where required by law.</li>
      </ul>
      <h2>Orders and payment</h2>
      <ul>
        <li>An order is confirmed only after successful payment through Razorpay.</li>
        <li>
          If a piece becomes unavailable after payment, we cancel the order and refund you in full.
        </li>
        <li>
          We may cancel orders that look fraudulent or contain obvious pricing errors, with a full
          refund.
        </li>
      </ul>
      <h2>Shipping, returns and refunds</h2>
      <p>See our Shipping policy and Refunds and cancellations policy.</p>
      <h2>Your account</h2>
      <p>Keep your password private. You&apos;re responsible for activity on your account.</p>
      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of India. Disputes are subject to the courts at the
        city of our registered office.
      </p>
      <h2>Contact and grievances</h2>
      <p>
        {b.email} · {b.phone}. Grievance officer: {b.grievanceName} ({b.grievanceEmail}).
      </p>
    </>
  );
}
