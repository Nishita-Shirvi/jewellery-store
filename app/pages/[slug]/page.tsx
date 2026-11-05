import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/lib/markdown";
import { getContentPage } from "@/services/merch.service";

/** Editable pages (Phase 24): About us, Jewellery care, Size guide… managed in Admin → Content. */
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const page = await getContentPage((await params).slug, (await searchParams).preview);
  if (!page) return { title: "Page not found" };
  return {
    title: page.title,
    description: page.seoDescription ?? undefined,
    alternates: { canonical: `/pages/${(await params).slug}` },
    ...(page.isPreview ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function ContentPage({ params, searchParams }: Props) {
  const page = await getContentPage((await params).slug, (await searchParams).preview);
  if (!page) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {page.isPreview && (
        <p
          role="status"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Preview of the draft — customers see the last published version.
        </p>
      )}
      <h1 className="text-4xl">{page.title}</h1>
      <Markdown source={page.body} className="mt-6 space-y-4 leading-relaxed" />
    </article>
  );
}
