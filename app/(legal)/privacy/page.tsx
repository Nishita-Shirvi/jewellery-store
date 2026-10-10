import type { Metadata } from "next";
import { POLICY_LAST_UPDATED, getBusiness } from "@/lib/business";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const b = getBusiness();
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>
      <p>
        {b.legalName} (&quot;we&quot;) runs {b.storeName}. This policy explains what personal data
        we collect, why, and your rights under India&apos;s Digital Personal Data Protection Act,
        2023.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          Account details: name, email address and an encrypted (hashed) password, or your Google
          sign-in.
        </li>
        <li>Order details: delivery addresses, phone number, items bought and order history.</li>
        <li>
          Payment confirmations from Razorpay. We never see or store your card, UPI PIN or bank
          details.
        </li>
        <li>
          Technical data needed to run the site securely, such as error reports and basic logs.
        </li>
      </ul>
      <h2>Why we use it</h2>
      <ul>
        <li>To process and deliver your orders, and send order emails.</li>
        <li>
          To keep your account and our store secure (for example, limiting repeated login attempts).
        </li>
        <li>To meet legal duties such as tax and invoice records.</li>
      </ul>
      <h2>Who we share it with</h2>
      <p>
        Only the service providers we need to run the store: Razorpay (payments), our courier
        partners (delivery), Resend (emails), Neon and Vercel (hosting), Cloudinary (product images)
        and Sentry (error tracking). We do not sell your data.
      </p>
      <h2>Cookies</h2>
      <p>
        We use essential cookies to keep you logged in and remember your cart. We don&apos;t use
        advertising cookies.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Account data is kept while your account is open. Order and invoice records are kept as long
        as tax law requires.
      </p>
      <h2>Your rights</h2>
      <p>
        You can ask to access, correct or delete your personal data, or withdraw consent, by writing
        to our grievance officer below.
      </p>
      <h2>Grievance officer</h2>
      <p>
        {b.grievanceName} · {b.grievanceEmail}
        <br />
        {b.legalName}, {b.address}
      </p>
    </>
  );
}
