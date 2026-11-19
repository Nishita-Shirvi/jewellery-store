import type { Metadata } from "next";
import Link from "next/link";
import { getBusiness } from "@/lib/business";
import { config } from "@/lib/config";
import { whatsappLink } from "@/lib/support";
import { getStorefrontSettings, whatsappNumber } from "@/services/storefront.service";

export const metadata: Metadata = { title: "Contact us" };

export default async function ContactPage() {
  const b = getBusiness();
  const s = await getStorefrontSettings();
  const whatsapp = whatsappLink(await whatsappNumber(), "Hello, I have a question.");
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
        <dd>{s.phone || b.phone}</dd>
        {whatsapp && (
          <>
            <dt className="text-muted-foreground">WhatsApp</dt>
            <dd>
              <a className="underline" href={whatsapp} target="_blank" rel="noopener noreferrer">
                {s.whatsapp}
              </a>
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Hours</dt>
        <dd>{s.hours || "Monday–Saturday, 10 am – 6 pm IST"}</dd>
        {s.showroomAddress && (
          <>
            <dt className="text-muted-foreground">Showroom</dt>
            <dd className="whitespace-pre-line">
              {s.showroomAddress}
              {s.mapUrl && (
                <>
                  <br />
                  <a
                    className="underline"
                    href={s.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Google Maps
                  </a>
                </>
              )}
              {config.features.visit_booking && (
                <>
                  <br />
                  <Link className="underline" href="/visit">
                    Book a visit
                  </Link>
                </>
              )}
            </dd>
          </>
        )}
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
