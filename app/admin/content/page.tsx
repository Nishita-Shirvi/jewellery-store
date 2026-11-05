import Link from "next/link";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { ScheduleFields, type FestivalPreset } from "@/components/admin/schedule-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requirePermissionPage } from "@/lib/auth-guards";
import { describeRules, formatIst, readRules, scheduleLabel, toIstLocal } from "@/lib/merch";
import { makePreviewToken } from "@/lib/preview";
import { adminListContent, festivalPresets } from "@/services/merch.service";
import {
  createStarterCollectionsAction,
  deleteAnnouncementAction,
  deleteHomeSectionAction,
  saveAnnouncementAction,
  saveHomeSectionAction,
} from "../actions";

export const dynamic = "force-dynamic";

const area =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";
const select = "border-input bg-background h-9 w-full rounded-md border px-2 text-sm";

const LABEL_TONE = {
  Draft: "bg-muted text-foreground",
  Scheduled: "bg-amber-100 text-amber-900",
  Live: "bg-emerald-100 text-emerald-900",
  Ended: "bg-zinc-200 text-zinc-700",
} as const;

function StatusPill(item: Parameters<typeof scheduleLabel>[0]) {
  const label = scheduleLabel(item);
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${LABEL_TONE[label]}`}>{label}</span>
  );
}

function When({ startsAt, endsAt }: { startsAt: Date | null; endsAt: Date | null }) {
  if (!startsAt && !endsAt) return <span className="text-muted-foreground text-xs">No dates</span>;
  return (
    <span className="text-muted-foreground text-xs">
      {formatIst(startsAt)} → {formatIst(endsAt)}
    </span>
  );
}

type Announcement = Awaited<ReturnType<typeof adminListContent>>["announcements"][number];
type Section = Awaited<ReturnType<typeof adminListContent>>["sections"][number];

function AnnouncementFields({ a, festivals }: { a?: Announcement; festivals: FestivalPreset[] }) {
  const p = a?.id ?? "new-announcement";
  return (
    <>
      {a && <input type="hidden" name="announcementId" value={a.id} />}
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-message`}>Message</Label>
        <Input
          id={`${p}-message`}
          name="message"
          defaultValue={a?.message}
          maxLength={160}
          placeholder="Dhanteras offer: free gold coin on orders above ₹50,000"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_6rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-link`}>Link (optional)</Label>
          <Input
            id={`${p}-link`}
            name="linkUrl"
            defaultValue={a?.linkUrl ?? ""}
            placeholder="/collections/festive"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-label`}>Link text</Label>
          <Input
            id={`${p}-label`}
            name="linkLabel"
            defaultValue={a?.linkLabel ?? ""}
            placeholder="Shop now"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-priority`}>Priority</Label>
          <Input
            id={`${p}-priority`}
            name="priority"
            type="number"
            min={0}
            max={100}
            defaultValue={a?.priority ?? 0}
          />
        </div>
      </div>
      <ScheduleFields
        idPrefix={p}
        status={a?.status ?? "DRAFT"}
        startsAt={toIstLocal(a?.startsAt)}
        endsAt={toIstLocal(a?.endsAt)}
        festivals={festivals}
      />
    </>
  );
}

function SectionFields({
  s,
  collections,
  festivals,
}: {
  s?: Section;
  collections: { id: string; title: string }[];
  festivals: FestivalPreset[];
}) {
  const p = s?.id ?? "new-section";
  return (
    <>
      {s && <input type="hidden" name="sectionId" value={s.id} />}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_6rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-kind`}>Type</Label>
          <select
            id={`${p}-kind`}
            name="sectionKind"
            defaultValue={s?.kind ?? "HERO"}
            className={select}
          >
            <option value="HERO">Big image + heading</option>
            <option value="BANNER">Clickable banner</option>
            <option value="PRODUCTS">Products from a collection</option>
            <option value="TEXT">Heading and text</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-title`}>Heading</Label>
          <Input id={`${p}-title`} name="title" defaultValue={s?.title} maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-position`}>Order</Label>
          <Input
            id={`${p}-position`}
            name="position"
            type="number"
            min={0}
            defaultValue={s?.position ?? 0}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-subtitle`}>Line under the heading (optional)</Label>
        <Input id={`${p}-subtitle`} name="subtitle" defaultValue={s?.subtitle} maxLength={300} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-desktop`}>Image for computers</Label>
          <Input
            id={`${p}-desktop`}
            name="imageDesktop"
            defaultValue={s?.imageDesktop ?? ""}
            placeholder="Upload in Products, then paste its address"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-mobile`}>Image for phones (optional)</Label>
          <Input id={`${p}-mobile`} name="imageMobile" defaultValue={s?.imageMobile ?? ""} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-collection`}>Collection (for a products row)</Label>
          <select
            id={`${p}-collection`}
            name="sectionCollectionId"
            defaultValue={s?.collectionId ?? ""}
            className={select}
          >
            <option value="">—</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-link`}>Button / banner link</Label>
          <Input
            id={`${p}-link`}
            name="linkUrl"
            defaultValue={s?.linkUrl ?? ""}
            placeholder="/collections/bridal"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}-label`}>Button text</Label>
          <Input id={`${p}-label`} name="linkLabel" defaultValue={s?.linkLabel ?? ""} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}-body`}>Text (for a text section; simple formatting allowed)</Label>
        <textarea
          id={`${p}-body`}
          name="sectionBody"
          rows={3}
          defaultValue={s?.body}
          className={area}
        />
      </div>
      <ScheduleFields
        idPrefix={p}
        status={s?.status ?? "DRAFT"}
        startsAt={toIstLocal(s?.startsAt)}
        endsAt={toIstLocal(s?.endsAt)}
        festivals={festivals}
      />
    </>
  );
}

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requirePermissionPage("content.manage", "/admin/content");
  const { error, saved } = await searchParams;
  const { collections, sections, announcements, pages } = await adminListContent();
  const festivals = festivalPresets();
  const homePreview = `/?preview=${makePreviewToken("home", "home")}`;

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Announcement bar, homepage, collections and pages. Published items go live — and disappear
          — on their dates by themselves; no developer needed.
        </p>
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

      <section id="announcements" aria-labelledby="ann-h" className="space-y-4">
        <h2 id="ann-h" className="text-lg font-medium">
          Announcement bar
        </h2>
        <p className="text-muted-foreground text-sm">
          The thin strip above the header. If several are live, the highest priority shows.
        </p>
        <ul className="divide-border divide-y rounded-md border">
          {announcements.length === 0 && (
            <li className="text-muted-foreground p-3 text-sm">No announcements yet.</li>
          )}
          {announcements.map((a) => (
            <li key={a.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill {...a} />
                <span className="text-sm">{a.message}</span>
                <When {...a} />
              </div>
              <details>
                <summary className="cursor-pointer text-sm underline">Edit</summary>
                <form action={saveAnnouncementAction} className="mt-3 space-y-3">
                  <AnnouncementFields a={a} festivals={festivals} />
                  <Button type="submit" size="sm">
                    Save announcement
                  </Button>
                </form>
                <form action={deleteAnnouncementAction} className="mt-2">
                  <input type="hidden" name="announcementId" value={a.id} />
                  <ConfirmSubmit
                    label="Delete"
                    title="Delete this announcement?"
                    description="It disappears from the site straight away."
                    confirmLabel="Delete"
                  />
                </form>
              </details>
            </li>
          ))}
        </ul>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">New announcement</summary>
          <form
            action={saveAnnouncementAction}
            className="mt-3 space-y-3"
            aria-label="New announcement"
          >
            <AnnouncementFields festivals={festivals} />
            <Button type="submit" size="sm">
              Save announcement
            </Button>
          </form>
        </details>
      </section>

      <section id="homepage" aria-labelledby="home-h" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="home-h" className="text-lg font-medium">
            Homepage
          </h2>
          <Link href={homePreview} target="_blank" className="text-sm underline">
            Preview homepage with drafts
          </Link>
        </div>
        <p className="text-muted-foreground text-sm">
          While no section is live, the standard homepage shows. Sections appear in
          &ldquo;Order&rdquo; (smallest first).
        </p>
        <ul className="divide-border divide-y rounded-md border">
          {sections.length === 0 && (
            <li className="text-muted-foreground p-3 text-sm">
              No sections — the standard homepage is showing.
            </li>
          )}
          {sections.map((s) => (
            <li key={s.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-6 text-xs">#{s.position}</span>
                <StatusPill {...s} />
                <span className="text-sm font-medium">{s.title || "(no heading)"}</span>
                <span className="text-muted-foreground text-xs">
                  {s.kind.toLowerCase()}
                  {s.collection ? ` · ${s.collection.title}` : ""}
                </span>
                <When {...s} />
              </div>
              <details>
                <summary className="cursor-pointer text-sm underline">Edit</summary>
                <form action={saveHomeSectionAction} className="mt-3 space-y-3">
                  <SectionFields s={s} collections={collections} festivals={festivals} />
                  <Button type="submit" size="sm">
                    Save section
                  </Button>
                </form>
                <form action={deleteHomeSectionAction} className="mt-2">
                  <input type="hidden" name="sectionId" value={s.id} />
                  <ConfirmSubmit
                    label="Delete"
                    title="Delete this section?"
                    description="It disappears from the homepage straight away."
                    confirmLabel="Delete"
                  />
                </form>
              </details>
            </li>
          ))}
        </ul>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">New homepage section</summary>
          <form
            action={saveHomeSectionAction}
            className="mt-3 space-y-3"
            aria-label="New homepage section"
          >
            <SectionFields collections={collections} festivals={festivals} />
            <Button type="submit" size="sm">
              Save section
            </Button>
          </form>
        </details>
      </section>

      <section id="collections" aria-labelledby="col-h" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="col-h" className="text-lg font-medium">
            Collections
          </h2>
          <div className="flex gap-2">
            <form action={createStarterCollectionsAction}>
              <Button type="submit" size="sm" variant="outline">
                Add occasion collections
              </Button>
            </form>
            <Button asChild size="sm">
              <Link href="/admin/content/collections/new">New collection</Link>
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Pages at /collections/&lt;address&gt;: hand-picked products, or every product matching
          rules (e.g. tag &ldquo;bridal&rdquo;, gold, under ₹50,000).
        </p>
        <ul className="divide-border divide-y rounded-md border">
          {collections.length === 0 && (
            <li className="text-muted-foreground p-3 text-sm">No collections yet.</li>
          )}
          {collections.map((c) => {
            const rules = readRules(c.rules);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-2 p-3">
                <StatusPill {...c} />
                <Link
                  href={`/admin/content/collections/${c.id}`}
                  className="text-sm font-medium underline"
                >
                  {c.title}
                </Link>
                <span className="text-muted-foreground text-xs">
                  /collections/{c.slug} ·{" "}
                  {c.kind === "MANUAL"
                    ? `${c._count.products} hand-picked`
                    : rules
                      ? describeRules(rules)
                      : "rules unreadable"}
                </span>
                <When {...c} />
              </li>
            );
          })}
        </ul>
      </section>

      <section id="pages" aria-labelledby="pages-h" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pages-h" className="text-lg font-medium">
            Pages
          </h2>
          <Button asChild size="sm">
            <Link href="/admin/content/pages/new">New page</Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          About us, Jewellery care, Size guide… at /pages/&lt;address&gt;. The legal pages (privacy,
          terms, returns) come from config.ini and aren&apos;t edited here.
        </p>
        <ul className="divide-border divide-y rounded-md border">
          {pages.length === 0 && (
            <li className="text-muted-foreground p-3 text-sm">No pages yet.</li>
          )}
          {pages.map((pg) => (
            <li key={pg.id} className="flex flex-wrap items-center gap-2 p-3">
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${pg.status === "PUBLISHED" ? LABEL_TONE.Live : LABEL_TONE.Draft}`}
              >
                {pg.status === "PUBLISHED" ? "Published" : "Draft"}
              </span>
              <Link
                href={`/admin/content/pages/${pg.id}`}
                className="text-sm font-medium underline"
              >
                {pg.title}
              </Link>
              <span className="text-muted-foreground text-xs">/pages/{pg.slug}</span>
              {pg.status === "PUBLISHED" && pg.draftBody !== pg.body && (
                <span className="text-xs text-amber-800">Unpublished changes</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
