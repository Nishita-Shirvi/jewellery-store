import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { ScheduleFields } from "@/components/admin/schedule-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requirePermissionPage } from "@/lib/auth-guards";
import { isLive, readRules, toIstLocal } from "@/lib/merch";
import { makePreviewToken } from "@/lib/preview";
import { getCategories } from "@/services/catalog.service";
import { adminGetCollection, festivalPresets } from "@/services/merch.service";
import {
  deleteCollectionAction,
  saveCollectionAction,
  setCollectionProductsAction,
} from "../../../actions";

export const dynamic = "force-dynamic";

const area =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";
const select = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

export default async function CollectionEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  await requirePermissionPage("content.manage", `/admin/content/collections/${id}`);
  const { error, saved } = await searchParams;
  const isNew = id === "new";
  const c = isNew ? null : await adminGetCollection(id);
  if (!isNew && !c) notFound();
  const rules = (c && readRules(c.rules)) || {};
  const categories = await getCategories();
  const live = c ? isLive(c) : false;
  const previewUrl = c
    ? `/collections/${c.slug}${live ? "" : `?preview=${makePreviewToken("collection", c.id)}`}`
    : null;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/admin/content#collections" className="text-muted-foreground text-sm underline">
          ← Content
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {c ? c.title : "New collection"}
        </h1>
        {previewUrl && (
          <p className="mt-1 text-sm">
            <Link href={previewUrl} target="_blank" className="underline">
              {live ? "View on the site" : "Preview (link works for 48 hours)"}
            </Link>
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

      <form action={saveCollectionAction} className="space-y-4" aria-label="Collection">
        {c && <input type="hidden" name="collectionId" value={c.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="col-title">Title</Label>
            <Input id="col-title" name="title" defaultValue={c?.title} required maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="col-slug">Address</Label>
            <Input
              id="col-slug"
              name="slug"
              defaultValue={c?.slug}
              required
              placeholder="diwali-gold"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
            <p className="text-muted-foreground text-xs">/collections/&lt;address&gt;</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="col-desc">
            Introduction (simple formatting: **bold**, *italic*, lists)
          </Label>
          <textarea
            id="col-desc"
            name="description"
            rows={4}
            defaultValue={c?.description}
            className={area}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="col-seo-title">Search title (optional)</Label>
            <Input
              id="col-seo-title"
              name="seoTitle"
              defaultValue={c?.seoTitle ?? ""}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="col-image">Share image (optional)</Label>
            <Input id="col-image" name="image" defaultValue={c?.image ?? ""} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="col-seo-desc">Search description (optional)</Label>
          <Input
            id="col-seo-desc"
            name="seoDescription"
            defaultValue={c?.seoDescription ?? ""}
            maxLength={300}
          />
        </div>

        <fieldset className="space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">Products</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value="MANUAL"
                defaultChecked={(c?.kind ?? "MANUAL") === "MANUAL"}
              />
              Hand-picked
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="kind" value="RULE" defaultChecked={c?.kind === "RULE"} />
              Every product matching these rules
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rule-tags">Any of these tags</Label>
              <Input
                id="rule-tags"
                name="ruleTags"
                defaultValue={rules.tags?.join(", ") ?? ""}
                placeholder="bridal, festive"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-category">Category</Label>
              <select
                id="rule-category"
                name="ruleCategory"
                defaultValue={rules.categorySlug ?? ""}
                className={select}
              >
                <option value="">Any</option>
                {categories.map((cat) => (
                  <option key={cat.slug} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-metal">Metal</Label>
              <select
                id="rule-metal"
                name="ruleMetal"
                defaultValue={rules.metalType ?? ""}
                className={select}
              >
                <option value="">Any</option>
                <option value="GOLD">Gold</option>
                <option value="SILVER">Silver</option>
                <option value="PLATINUM">Platinum</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-min">Price from (₹)</Label>
              <Input
                id="rule-min"
                name="ruleMinPrice"
                inputMode="numeric"
                defaultValue={rules.minPrice ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-max">Price up to (₹)</Label>
              <Input
                id="rule-max"
                name="ruleMaxPrice"
                inputMode="numeric"
                defaultValue={rules.maxPrice ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-new">Added in the last … days</Label>
              <Input
                id="rule-new"
                name="ruleNewDays"
                inputMode="numeric"
                defaultValue={rules.newWithinDays ?? ""}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ruleOnSale" defaultChecked={rules.onSale ?? false} /> Only
            products with a sale (&ldquo;was&rdquo;) price
          </label>
          <p className="text-muted-foreground text-xs">
            Rules apply only to rule-based collections. Hand-picked products are set below after
            saving.
          </p>
        </fieldset>

        <ScheduleFields
          idPrefix="col"
          status={c?.status ?? "DRAFT"}
          startsAt={toIstLocal(c?.startsAt)}
          endsAt={toIstLocal(c?.endsAt)}
          festivals={festivalPresets()}
        />
        <Button type="submit">Save collection</Button>
      </form>

      {c?.kind === "MANUAL" && (
        <form
          action={setCollectionProductsAction}
          className="space-y-3"
          aria-label="Hand-picked products"
        >
          <input type="hidden" name="collectionId" value={c.id} />
          <h2 className="text-lg font-medium">Hand-picked products</h2>
          <p className="text-muted-foreground text-sm">
            One product address (or product link) per line, in the order to show them. Hidden
            products are skipped on the site.
          </p>
          <textarea
            name="productSlugs"
            rows={8}
            aria-label="Product addresses"
            defaultValue={c.products.map((p) => p.product.slug).join("\n")}
            className={`${area} font-mono`}
          />
          <Button type="submit" variant="outline">
            Save products
          </Button>
        </form>
      )}

      {c && (
        <form action={deleteCollectionAction}>
          <input type="hidden" name="collectionId" value={c.id} />
          <ConfirmSubmit
            label="Delete collection"
            title={`Delete "${c.title}"?`}
            description="Its page stops working and it's removed from the homepage. Products aren't affected."
            confirmLabel="Delete"
          />
        </form>
      )}
    </div>
  );
}
