import { getBusiness } from "@/lib/business";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const business = getBusiness();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {business.incomplete && process.env.NODE_ENV !== "production" && (
        <p className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Template text. Fill in the BUSINESS_* values in .env and have a lawyer review these pages
          before going live.
        </p>
      )}
      <article className="space-y-4 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </article>
    </div>
  );
}
