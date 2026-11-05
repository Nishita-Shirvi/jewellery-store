import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requirePermissionPage } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { Markdown } from "@/lib/markdown";
import { makePreviewToken } from "@/lib/preview";
import {
  deletePageAction,
  publishPageAction,
  savePageAction,
  unpublishPageAction,
} from "../../../actions";

export const dynamic = "force-dynamic";

const area =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

export default async function PageEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  await requirePermissionPage("content.manage", `/admin/content/pages/${id}`);
  const { error, saved } = await searchParams;
  const isNew = id === "new";
  const page = isNew ? null : await db.contentPage.findUnique({ where: { id } });
  if (!isNew && !page) notFound();
  const changed = page ? page.draftBody !== page.body : false;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/admin/content#pages" className="text-muted-foreground text-sm underline">
          ← Content
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{page?.title ?? "New page"}</h1>
        {page && (
          <p className="mt-1 flex flex-wrap gap-4 text-sm">
            <span>
              {page.status === "PUBLISHED" ? "Published" : "Draft"}
              {page.status === "PUBLISHED" && changed && " · draft has unpublished changes"}
            </span>
            <Link
              href={`/pages/${page.slug}?preview=${makePreviewToken("page", page.id)}`}
              target="_blank"
              className="underline"
            >
              Preview draft (link works for 48 hours)
            </Link>
            {page.status === "PUBLISHED" && (
              <Link href={`/pages/${page.slug}`} target="_blank" className="underline">
                View live page
              </Link>
            )}
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {saved}
        </p>
      )}

      <form action={savePageAction} className="space-y-4" aria-label="Page">
        {page && <input type="hidden" name="pageId" value={page.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="page-title">Title</Label>
            <Input
              id="page-title"
              name="title"
              defaultValue={page?.title}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-slug">Address</Label>
            <Input
              id="page-slug"
              name="slug"
              defaultValue={page?.slug}
              required
              placeholder="jewellery-care"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <p className="text-muted-foreground text-xs">/pages/&lt;address&gt;</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="page-seo">Search description (optional)</Label>
          <Input
            id="page-seo"
            name="seoDescription"
            defaultValue={page?.seoDescription ?? ""}
            maxLength={300}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="page-body">Text</Label>
          <textarea
            id="page-body"
            name="draftBody"
            rows={16}
            defaultValue={page?.draftBody}
            className={`${area} font-mono`}
          />
          <p className="text-muted-foreground text-xs">
            # Heading, ## Smaller heading, **bold**, *italic*, - bullet list, 1. numbered list,
            [link text](/collections/bridal). A blank line starts a new paragraph.
          </p>
        </div>
        <Button type="submit">Save draft</Button>
      </form>

      {page && (
        <div className="flex flex-wrap gap-3">
          <form action={publishPageAction}>
            <input type="hidden" name="pageId" value={page.id} />
            <Button type="submit" disabled={page.status === "PUBLISHED" && !changed}>
              {page.status === "PUBLISHED" ? "Publish changes" : "Publish"}
            </Button>
          </form>
          {page.status === "PUBLISHED" && (
            <form action={unpublishPageAction}>
              <input type="hidden" name="pageId" value={page.id} />
              <Button type="submit" variant="outline">
                Unpublish
              </Button>
            </form>
          )}
          <form action={deletePageAction}>
            <input type="hidden" name="pageId" value={page.id} />
            <ConfirmSubmit
              label="Delete page"
              title={`Delete "${page.title}"?`}
              description="Its address stops working. This can't be undone."
              confirmLabel="Delete"
            />
          </form>
        </div>
      )}

      {page?.draftBody && (
        <section aria-labelledby="draft-preview" className="rounded-md border p-4">
          <h2 id="draft-preview" className="text-muted-foreground text-sm font-medium">
            How the draft looks
          </h2>
          <div className="mt-3">
            <Markdown source={page.draftBody} />
          </div>
        </section>
      )}
    </div>
  );
}
