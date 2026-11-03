import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { config } from "@/lib/config";
import { whatsappLink } from "@/lib/support";
import { publishedFaqs } from "@/services/support.service";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Answers about orders, delivery, returns, payments and jewellery care.",
};
export const dynamic = "force-dynamic";

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.slice(0, 100);
  const faqs = await publishedFaqs(query);
  const groups = new Map<string, typeof faqs>();
  for (const f of faqs) groups.set(f.category, [...(groups.get(f.category) ?? []), f]);
  const whatsapp = whatsappLink(config.support.whatsapp_number, "Hello, I have a question.");

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <div>
        <h1 className="text-3xl">Help centre</h1>
        <form className="mt-4 flex gap-2" role="search" action="/help">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search, e.g. return, delivery time, hallmark"
            aria-label="Search the help centre"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </div>

      {faqs.length === 0 ? (
        <p className="text-muted-foreground" data-testid="faq-empty">
          {query ? `No answers found for "${query}".` : "No questions yet."}
        </p>
      ) : (
        [...groups].map(([category, items]) => (
          <section key={category} aria-labelledby={`faq-${category}`} className="space-y-2">
            <h2 id={`faq-${category}`} className="text-xl">
              {category}
            </h2>
            {items.map((f) => (
              <details key={f.id} className="border-border rounded-md border p-4" data-testid="faq">
                <summary className="cursor-pointer font-medium">{f.question}</summary>
                <p className="text-muted-foreground mt-2 text-sm whitespace-pre-line">{f.answer}</p>
              </details>
            ))}
          </section>
        ))
      )}

      <section className="border-border space-y-3 rounded-md border p-5">
        <h2 className="text-lg">Still need help?</h2>
        <p className="text-muted-foreground text-sm">
          Send us a message — about an order or anything else — and we&apos;ll reply by email,
          usually within a day.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/account/support/new">Contact support</Link>
          </Button>
          {whatsapp && (
            <Button asChild variant="outline">
              <a href={whatsapp} target="_blank" rel="noreferrer">
                Chat on WhatsApp
              </a>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
