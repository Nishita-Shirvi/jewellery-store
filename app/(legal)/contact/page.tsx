import type { Metadata } from "next";
import { getBusiness } from "@/lib/business";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  const b = getBusiness();
  return (
    <>
      <h1>Contact us</h1>
      <p>We&apos;re happy to help with orders, sizing, returns or anything else.</p>
      <dl className="grid grid-cols-[140px_1fr] gap-y-2">
        <dt className="text-muted-foreground">Email</dt>
        <dd>
          <a className="underline" href={`mailto:${b.email}`}>
            {b.email}
          </a>
        </dd>
        <dt className="text-muted-foreground">Phone</dt>
        <dd>{b.phone}</dd>
        <dt className="text-muted-foreground">Hours</dt>
        <dd>Monday–Saturday, 10 am – 6 pm IST</dd>
        <dt className="text-muted-foreground">Registered office</dt>
        <dd>
          {b.legalName}
          <br />
          {b.address}
        </dd>
        <dt className="text-muted-foreground">GSTIN</dt>
        <dd>{b.gstin}</dd>
        <dt className="text-muted-foreground">Grievance officer</dt>
        <dd>
          {b.grievanceName}
          <br />
          <a className="underline" href={`mailto:${b.grievanceEmail}`}>
            {b.grievanceEmail}
          </a>
        </dd>
      </dl>
    </>
  );
}
