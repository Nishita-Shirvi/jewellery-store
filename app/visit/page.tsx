import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { VisitForm } from "@/components/storefront/visit-form";
import { getCurrentUser } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { istDay } from "@/lib/report/dates";
import { whatsappLink } from "@/lib/support";
import { getProductBySlug } from "@/services/catalog.service";
import { getStorefrontSettings, whatsappNumber } from "@/services/storefront.service";
import { VISIT_MAX_DAYS_AHEAD } from "@/services/visit.service";

export const metadata: Metadata = {
  title: "Visit our showroom",
  description: "Book a time to see and try our jewellery in person.",
  alternates: { canonical: "/visit" },
};

export default async function VisitPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  if (!config.features.visit_booking) notFound();
  const { product: slug } = await searchParams;
  const [settings, user, product] = await Promise.all([
    getStorefrontSettings(),
    getCurrentUser(),
    typeof slug === "string" ? getProductBySlug(slug) : Promise.resolve(null),
  ]);
  const today = istDay(new Date());
  const max = istDay(new Date(Date.now() + VISIT_MAX_DAYS_AHEAD * 86_400_000));
  const whatsapp = whatsappLink(await whatsappNumber(), "Hello, I'd like to visit the showroom.");

  return (
    <div className="mx-auto grid max-w-5xl gap-12 px-4 py-12 md:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-3xl md:text-4xl">Visit our showroom</h1>
        <p className="text-muted-foreground mt-3 max-w-xl">
          See the pieces up close, try them on and get sized properly — no obligation to buy. Tell
          us when suits you and we&apos;ll call to confirm.
        </p>
        <div className="mt-8">
          <VisitForm
            productSlug={product?.slug}
            productName={product?.name}
            minDate={today}
            maxDate={max}
            defaults={{ name: user?.name ?? "", email: user?.email ?? "" }}
          />
        </div>
      </div>

      <aside className="bg-accent h-fit space-y-4 rounded-md p-6 text-sm">
        <h2 className="text-xl">Find us</h2>
        {settings.showroomAddress && (
          <p className="flex gap-2">
            <MapPin className="text-gold mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-pre-line">{settings.showroomAddress}</span>
          </p>
        )}
        {settings.hours && (
          <p className="flex gap-2">
            <Clock className="text-gold mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {settings.hours}
          </p>
        )}
        {settings.phone && (
          <p className="flex gap-2">
            <Phone className="text-gold mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} className="underline">
              {settings.phone}
            </a>
          </p>
        )}
        {whatsapp && config.features.whatsapp_button && (
          <p className="flex gap-2">
            <MessageCircle className="text-gold mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="underline">
              Message us on WhatsApp
            </a>
          </p>
        )}
        {settings.mapUrl && (
          <a
            href={settings.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-medium underline underline-offset-4"
          >
            Open in Google Maps
          </a>
        )}
        {!settings.showroomAddress && !settings.phone && (
          <p className="text-muted-foreground">Showroom details coming soon.</p>
        )}
      </aside>
    </div>
  );
}
