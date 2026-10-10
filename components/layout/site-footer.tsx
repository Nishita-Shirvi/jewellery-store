import Link from "next/link";
import { getBusiness } from "@/lib/business";
import { getCategories } from "@/services/catalog.service";

const help = [
  { href: "/shipping-policy", label: "Shipping" },
  { href: "/refund-policy", label: "Refunds and cancellations" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms" },
];

export async function SiteFooter() {
  const business = getBusiness();
  const categories = await getCategories();
  const year = new Date().getFullYear();

  return (
    <footer className="bg-primary text-primary-foreground mt-auto">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm space-y-3">
          <p className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>
            {business.storeName}
          </p>
          <p className="text-sm text-[#e9d9dc]">
            Hallmarked gold, sterling silver and certified diamonds, packed in tamper-proof boxes
            and insured until they reach you.
          </p>
          <p className="text-sm text-[#e9d9dc]">
            {business.email}
            <br />
            {business.phone}
          </p>
        </div>
        <nav aria-label="Shop">
          <p className="mb-3 text-sm font-semibold">Shop</p>
          <ul className="space-y-2 text-sm text-[#e9d9dc]">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/products?category=${c.slug}`}
                  className="hover:text-white hover:underline"
                >
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/products" className="hover:text-white hover:underline">
                All jewellery
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Store policies">
          <p className="mb-3 text-sm font-semibold">Help</p>
          <ul className="space-y-2 text-sm text-[#e9d9dc]">
            {help.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-[#d8c3c8]">
          © {year} {business.legalName}. GSTIN {business.gstin}. Grievance officer:{" "}
          {business.grievanceName}, {business.grievanceEmail}.
        </p>
      </div>
    </footer>
  );
}
