import Link from "next/link";
import { getBusiness } from "@/lib/business";
import { config } from "@/lib/config";
import { getCategories } from "@/services/catalog.service";
import { getStorefrontSettings } from "@/services/storefront.service";
import { NewsletterForm } from "@/components/marketing/marketing-forms";
import { Wordmark } from "@/components/layout/wordmark";
import { NEWSLETTER_CONSENT_TEXT } from "@/services/marketing.service";

const help = [
  { href: "/help", label: "Help centre" },
  ...(config.features.visit_booking ? [{ href: "/visit", label: "Visit the showroom" }] : []),
  ...(config.features.style_advisor ? [{ href: "/style-advisor", label: "Style advisor" }] : []),
  { href: "/size-guide", label: "Size guide" },
  { href: "/shipping-policy", label: "Shipping" },
  { href: "/refund-policy", label: "Refunds and cancellations" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms" },
];

const heading = "text-goldlight mb-3 text-[11px] font-bold tracking-[0.18em] uppercase";
const link = "hover:text-goldlight hover:underline underline-offset-4";

export async function SiteFooter() {
  const business = getBusiness();
  const [categories, showroom] = await Promise.all([
    getCategories(),
    getStorefrontSettings().catch(() => null),
  ]);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-deep text-on mt-auto">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div className="max-w-sm space-y-3">
          <Wordmark />
          <p className="pt-2 text-sm opacity-90">
            Hallmarked gold, sterling silver and certified diamonds, packed in tamper-proof boxes
            and insured until they reach you.
          </p>
          <p className="text-sm opacity-90">
            {business.email}
            <br />
            {business.phone}
          </p>
          <div className="pt-2">
            <NewsletterForm consentText={NEWSLETTER_CONSENT_TEXT} />
          </div>
        </div>
        <nav aria-label="Shop">
          <p className={heading}>Shop</p>
          <ul className="space-y-2 text-sm opacity-90">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/collections/${c.slug}`} className={link}>
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/products" className={link}>
                All jewellery
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Store policies">
          <p className={heading}>Help</p>
          <ul className="space-y-2 text-sm opacity-90">
            {help.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={link}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {showroom?.showroomAddress && (
          <div>
            <p className={heading}>The showroom</p>
            <address className="space-y-2 text-sm whitespace-pre-line not-italic opacity-90">
              {showroom.showroomAddress}
            </address>
            {showroom.hours && <p className="mt-2 text-sm opacity-90">{showroom.hours}</p>}
            {showroom.phone && <p className="mt-2 text-sm opacity-90">{showroom.phone}</p>}
            {showroom.mapUrl && (
              <a
                href={showroom.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${link} mt-2 inline-block text-sm underline`}
              >
                Open in Google Maps
              </a>
            )}
          </div>
        )}
      </div>
      <div className="border-gilt/30 border-t">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs opacity-80">
          © {year} {business.legalName}. GSTIN {business.gstin}. Grievance officer:{" "}
          {business.grievanceName}, {business.grievanceEmail}.
        </p>
      </div>
    </footer>
  );
}
