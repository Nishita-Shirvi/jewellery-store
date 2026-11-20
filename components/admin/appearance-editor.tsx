"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteThemeAction,
  saveDefaultModeAction,
  saveThemeAction,
  uploadAppearanceImageAction,
  videoUploadTicketAction,
} from "@/app/admin/appearance-actions";
import {
  DECORATIONS,
  THEME_PRESETS,
  themeStatus,
  type Appearance,
  type Decoration,
  type Theme,
  type ThemeHero,
  type ThemeStatus,
} from "@/lib/appearance";
import {
  DEFAULT_COLORS,
  contrast,
  shopTokens,
  type ColorMode,
  type ThemeColors,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const area =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

const STATUS: Record<ThemeStatus, { label: string; tone: string }> = {
  default: { label: "Default", tone: "bg-amber-100 text-amber-900" },
  live: { label: "Live now", tone: "bg-emerald-100 text-emerald-900" },
  upcoming: { label: "Scheduled", tone: "bg-sky-100 text-sky-900" },
  overlapped: { label: "Hidden by a later theme", tone: "bg-zinc-200 text-zinc-700" },
  ended: { label: "Ended", tone: "bg-zinc-200 text-zinc-700" },
  off: { label: "No dates", tone: "bg-zinc-200 text-zinc-700" },
};

const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: "brand", label: "Main (header, buttons)" },
  { key: "gold", label: "Gold" },
  { key: "bg", label: "Background" },
  { key: "alt", label: "Second background" },
  { key: "ink", label: "Text" },
  { key: "muted", label: "Secondary text" },
  { key: "festive", label: "Festive accent" },
];

/** Built-in photos, for when uploads aren't set up (or as quick picks). */
const BUILT_IN_PHOTOS = [
  { url: "/images/editorial/kundan-necklace.jpg", label: "Kundan necklace" },
  { url: "/images/editorial/bridal-set.jpg", label: "Bridal set on red silk" },
  { url: "/images/editorial/bangles.jpg", label: "Kundan bangles" },
  { url: "/images/editorial/solitaire-rings.jpg", label: "Solitaire rings" },
];

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(t: Theme): string {
  if (t.isDefault) return "Always on";
  if (!t.from || !t.until) return "No dates";
  return `${t.from} → ${t.until}`;
}

interface Props {
  initial: Appearance;
  initialSelected: string;
  today: string;
  previewTokens: Record<string, string>;
  festivals: { name: string; from: string; to: string }[];
  imageUpload: boolean;
  videoUpload: boolean;
  maxVideoMb: number;
}

/** Admin → Appearance: pick a theme on the left, edit it on the right, save. */
export function AppearanceEditor(props: Props) {
  const { today, festivals } = props;
  const [appearance, setAppearance] = useState(props.initial);
  const [tokens, setTokens] = useState(props.previewTokens);
  const [selectedId, setSelectedId] = useState(props.initialSelected);
  const [draft, setDraft] = useState<Theme>(() =>
    props.initial.themes.find((t) => t.id === props.initialSelected)!,
  );
  const [dirty, setDirty] = useState(false);
  const [askSwitch, setAskSwitch] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [preset, setPreset] = useState(THEME_PRESETS[0]!.key);
  const isNew = !appearance.themes.some((t) => t.id === draft.id);

  function edit(patch: Partial<Theme>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }
  const editHero = (patch: Partial<ThemeHero>) => edit({ hero: { ...draft.hero, ...patch } });
  const editColor = (key: keyof ThemeColors, value: string) =>
    edit({ colors: { ...draft.colors, [key]: value } });

  function open(id: string) {
    if (dirty && id !== selectedId) {
      setAskSwitch(id);
      return;
    }
    const theme = appearance.themes.find((t) => t.id === id);
    if (!theme) return;
    setSelectedId(id);
    setDraft(theme);
    setDirty(false);
    setErrors({});
    setNotice(null);
    setAskSwitch(null);
    setAskDelete(false);
  }

  function discard() {
    setDirty(false);
    const target = askSwitch ?? selectedId;
    const theme = appearance.themes.find((t) => t.id === target) ?? appearance.themes[0]!;
    setSelectedId(theme.id);
    setDraft(theme);
    setErrors({});
    setAskSwitch(null);
    setNotice(null);
  }

  function addTheme() {
    const p = THEME_PRESETS.find((x) => x.key === preset)!;
    const theme: Theme = {
      ...structuredClone(p.theme),
      id: `new-${Date.now()}`,
      isDefault: false,
      from: today,
      until: addDays(today, 14),
    };
    setSelectedId(theme.id);
    setDraft(theme);
    setDirty(true);
    setErrors({});
    setNotice({ ok: true, text: `New theme from “${p.label}”. Change anything, then save.` });
  }

  function save() {
    start(async () => {
      const res = await saveThemeAction(draft);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setNotice({ ok: false, text: res.error });
        return;
      }
      const saved = res.appearance.themes.find((t) => t.id === res.savedId)!;
      setAppearance(res.appearance);
      setTokens(res.previewTokens);
      setSelectedId(saved.id);
      setDraft(saved);
      setDirty(false);
      setErrors({});
      setNotice({ ok: true, text: "Saved. The shop shows it now if it's live today." });
    });
  }

  function remove() {
    start(async () => {
      const res = await deleteThemeAction(draft.id);
      setAskDelete(false);
      if (!res.ok) {
        setNotice({ ok: false, text: res.error });
        return;
      }
      setAppearance(res.appearance);
      setTokens(res.previewTokens);
      const next = res.appearance.themes.find((t) => t.id === res.savedId)!;
      setSelectedId(next.id);
      setDraft(next);
      setDirty(false);
      setNotice({ ok: true, text: `Deleted “${draft.name}”.` });
    });
  }

  const err = (key: string) =>
    errors[key] ? <p className="text-xs text-red-700">{errors[key]}</p> : null;
  const listed = isNew ? [...appearance.themes, draft] : appearance.themes;

  return (
    <div className="space-y-8">
      <div className="border-border grid overflow-hidden rounded-lg border lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Theme list */}
        <aside className="border-border bg-muted/40 space-y-3 border-b p-4 lg:border-r lg:border-b-0">
          <h2 className="text-sm font-semibold">Themes</h2>
          <ul className="space-y-2">
            {listed.map((t) => {
              const st = t.id === draft.id && isNew ? null : themeStatus(t, appearance, today);
              const shown = t.id === draft.id ? draft : t;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => open(t.id)}
                    aria-current={t.id === selectedId ? "true" : undefined}
                    className={cn(
                      "bg-background w-full rounded-md border p-3 text-left text-sm",
                      t.id === selectedId ? "border-primary ring-primary ring-1" : "border-border",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex" aria-hidden="true">
                        {(["brand", "gold", "bg"] as const).map((k) => (
                          <i
                            key={k}
                            className="border-border -mr-1 size-4 rounded-full border"
                            style={{ background: shown.colors[k] }}
                          />
                        ))}
                      </span>
                      <span className="ml-1 font-medium">{shown.name || "Untitled"}</span>
                    </span>
                    <span className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {dateRange(shown)}
                      {st ? (
                        <span className={cn("rounded px-1.5 py-0.5", STATUS[st].tone)}>
                          {STATUS[st].label}
                        </span>
                      ) : (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-900">
                          Not saved
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-border space-y-2 border-t pt-3">
            <Label htmlFor="preset">Add a theme</Label>
            <div className="flex gap-2">
              <select
                id="preset"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-2 text-sm"
              >
                {THEME_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={addTheme} disabled={dirty}>
                Add
              </Button>
            </div>
            {dirty && (
              <p className="text-muted-foreground text-xs">Save or discard your changes first.</p>
            )}
            <p className="text-muted-foreground text-xs">
              If two themes overlap, the one that started later shows.
            </p>
          </div>
        </aside>

        {/* Editor */}
        <form
          aria-label={`Theme: ${draft.name}`}
          className="min-w-0 space-y-8 p-4 sm:p-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {askSwitch && (
            <div
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              You have unsaved changes to “{draft.name}”.{" "}
              <button type="button" className="font-medium underline" onClick={discard}>
                Discard them
              </button>{" "}
              or{" "}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => setAskSwitch(null)}
              >
                keep editing
              </button>
              .
            </div>
          )}
          {notice && (
            <p
              role={notice.ok ? "status" : "alert"}
              className={cn(
                "rounded-md border p-3 text-sm",
                notice.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800",
              )}
            >
              {notice.text}
            </p>
          )}

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-3 text-base font-semibold">Theme</legend>
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Theme name</Label>
              <Input
                id="t-name"
                value={draft.name}
                maxLength={40}
                onChange={(e) => edit({ name: e.target.value })}
              />
              {err("name")}
            </div>
            {draft.isDefault ? (
              <p className="text-muted-foreground self-end text-sm sm:col-span-2">
                Everyday is always on. It shows whenever no festival theme is live.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="t-from">Live from</Label>
                  <Input
                    id="t-from"
                    type="date"
                    value={draft.from}
                    onChange={(e) => edit({ from: e.target.value })}
                  />
                  {err("from")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-until">Live until (included)</Label>
                  <Input
                    id="t-until"
                    type="date"
                    value={draft.until}
                    onChange={(e) => edit({ until: e.target.value })}
                  />
                  {err("until")}
                </div>
                {festivals.length > 0 && (
                  <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs sm:col-span-3">
                    Festival dates:
                    {festivals.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        className="border-border hover:bg-accent rounded border px-2 py-0.5"
                        onClick={() => edit({ from: f.from, until: f.to })}
                      >
                        {f.name}
                      </button>
                    ))}
                  </p>
                )}
              </>
            )}
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="mb-3 text-base font-semibold">Colours</legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {COLOR_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`c-${key}`}>{label}</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label={`${label}: pick`}
                      value={draft.colors[key]}
                      onChange={(e) => editColor(key, e.target.value)}
                      className="border-input h-9 w-11 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
                    />
                    <Input
                      id={`c-${key}`}
                      value={draft.colors[key]}
                      maxLength={7}
                      spellCheck={false}
                      onChange={(e) => editColor(key, e.target.value.trim())}
                      className="font-mono"
                    />
                  </div>
                  {err(`colors.${key}`)}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => edit({ colors: DEFAULT_COLORS })}
              >
                Default colours
              </Button>
              <span className="text-muted-foreground text-xs">
                Vineet maroon {DEFAULT_COLORS.brand}, gold {DEFAULT_COLORS.gold} and ivory{" "}
                {DEFAULT_COLORS.bg}.
              </span>
            </div>
            <ContrastWarning colors={draft.colors} />
            <ColorPreview colors={draft.colors} />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-3 text-base font-semibold">Festive decoration</legend>
            {DECORATIONS.map((d) => (
              <label key={d.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="decor"
                  checked={draft.decor === d.value}
                  onChange={() => edit({ decor: d.value as Decoration })}
                />
                {d.label}
              </label>
            ))}
          </fieldset>

          <HeroFields
            hero={draft.hero}
            edit={editHero}
            err={err}
            imageUpload={props.imageUpload}
            videoUpload={props.videoUpload}
            maxVideoMb={props.maxVideoMb}
            onNotice={setNotice}
          />

          <fieldset className="space-y-1.5">
            <legend className="mb-3 text-base font-semibold">Offer bar</legend>
            <Label htmlFor="t-offer">Line above the header while this theme is live</Label>
            <Input
              id="t-offer"
              value={draft.offer}
              maxLength={160}
              placeholder="*Diwali offer:* 20% off making charges, till 12 Nov"
              onChange={(e) => edit({ offer: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Optional. *Stars* show words in gold. An announcement from Content → Announcements
              shows instead when one is live.
            </p>
            {err("offer")}
          </fieldset>

          <div className="border-border flex flex-wrap items-center gap-3 border-t pt-5">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save theme"}
            </Button>
            <Button type="button" variant="outline" disabled={!dirty || pending} onClick={discard}>
              Discard changes
            </Button>
            {!isNew && tokens[draft.id] && (
              <Link
                href={`/?theme=${encodeURIComponent(draft.id)}&preview=${tokens[draft.id]}`}
                target="_blank"
                className="text-sm underline underline-offset-4"
              >
                Preview on the site{dirty ? " (saved version)" : ""}
              </Link>
            )}
            {!draft.isDefault && !isNew && (
              <span className="ml-auto">
                {askDelete ? (
                  <span className="flex items-center gap-2 text-sm">
                    Delete “{draft.name}”?
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={remove}
                      disabled={pending}
                    >
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAskDelete(false)}
                    >
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAskDelete(true)}
                  >
                    Delete theme
                  </Button>
                )}
              </span>
            )}
          </div>
        </form>
      </div>

      <DefaultModeForm initial={appearance.defaultMode} />
    </div>
  );
}

function HeroFields({
  hero,
  edit,
  err,
  imageUpload,
  videoUpload,
  maxVideoMb,
  onNotice,
}: {
  hero: ThemeHero;
  edit: (patch: Partial<ThemeHero>) => void;
  err: (key: string) => React.ReactNode;
  imageUpload: boolean;
  videoUpload: boolean;
  maxVideoMb: number;
  onNotice: (n: { ok: boolean; text: string }) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);

  async function uploadPhoto(file: File) {
    setUploading("Uploading photo…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadAppearanceImageAction(fd);
    setUploading(null);
    if (res.ok) edit({ image: res.url });
    else onNotice({ ok: false, text: res.error });
  }

  async function uploadVideo(file: File) {
    if (!/^video\/(mp4|webm)$/.test(file.type) && !/\.(mp4|webm)$/i.test(file.name)) {
      onNotice({ ok: false, text: "Choose an MP4 or WebM video." });
      return;
    }
    const ticket = await videoUploadTicketAction();
    if (!ticket.ok) {
      onNotice({ ok: false, text: ticket.error });
      return;
    }
    if (file.size > ticket.maxBytes) {
      onNotice({ ok: false, text: `Videos must be ${maxVideoMb} MB or smaller.` });
      return;
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(ticket.fields)) fd.append(k, v);
    fd.append("file", file);
    setUploading("Uploading video… 0%");
    const url = await new Promise<string | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", ticket.url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setUploading(`Uploading video… ${Math.round((e.loaded / e.total) * 100)}%`);
      };
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText) as { secure_url?: string };
          resolve(xhr.status < 300 && json.secure_url ? json.secure_url : null);
        } catch {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.send(fd);
    });
    setUploading(null);
    if (url) edit({ video: url, layout: "video" });
    else onNotice({ ok: false, text: "The video didn't upload. Please try again." });
  }

  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-base font-semibold">Top of the home page</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="layout"
            checked={hero.layout === "arch"}
            onChange={() => edit({ layout: "arch" })}
          />
          Photo in an arch, text beside it
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="layout"
            checked={hero.layout === "video"}
            onChange={() => edit({ layout: "video" })}
          />
          Full-width background video
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of any allowed URL */}
        <img
          src={hero.image}
          alt=""
          className="border-border aspect-[4/5] w-40 rounded-md border object-cover"
        />
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="h-photo">
              Photo
              {hero.layout === "video" ? " (shown until the video plays, and on slow data)" : ""}
            </Label>
            {imageUpload ? (
              <input
                id="h-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!!uploading}
                onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                className="block text-sm"
              />
            ) : (
              <p className="text-muted-foreground text-xs">
                Uploads switch on when Cloudinary or R2 is set up (config/images.ini).
              </p>
            )}
            <select
              aria-label="Or use one of our photos"
              value={BUILT_IN_PHOTOS.some((p) => p.url === hero.image) ? hero.image : ""}
              onChange={(e) => e.target.value && edit({ image: e.target.value })}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">Or use one of our photos…</option>
              {BUILT_IN_PHOTOS.map((p) => (
                <option key={p.url} value={p.url}>
                  {p.label}
                </option>
              ))}
            </select>
            {err("hero.image")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-alt">Describe the photo (for screen readers)</Label>
            <Input
              id="h-alt"
              value={hero.imageAlt}
              maxLength={160}
              onChange={(e) => edit({ imageAlt: e.target.value })}
            />
          </div>
          {hero.layout === "video" && (
            <div className="space-y-1.5">
              <Label htmlFor="h-video">Your own video</Label>
              {videoUpload && (
                <input
                  id="h-video-file"
                  type="file"
                  aria-label="Upload a video"
                  accept="video/mp4,video/webm"
                  disabled={!!uploading}
                  onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])}
                  className="block text-sm"
                />
              )}
              <Input
                id="h-video"
                value={hero.video}
                placeholder="https://res.cloudinary.com/…/video/upload/….mp4"
                onChange={(e) => edit({ video: e.target.value.trim() })}
              />
              <p className="text-muted-foreground text-xs">
                MP4 or WebM up to {maxVideoMb} MB
                {videoUpload ? "" : " — paste a link to a video on our Cloudinary or R2"}. It plays
                muted on a loop; shoppers who ask for less motion or save data see the photo
                instead.
              </p>
              {err("hero.video")}
            </div>
          )}
          {uploading && (
            <p role="status" className="text-muted-foreground text-sm">
              {uploading}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="h-eyebrow">Small line above the heading</Label>
          <Input
            id="h-eyebrow"
            value={hero.eyebrow}
            maxLength={80}
            onChange={(e) => edit({ eyebrow: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-heading">Heading</Label>
          <Input
            id="h-heading"
            value={hero.heading}
            maxLength={120}
            onChange={(e) => edit({ heading: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">
            Put *stars* around words to show them in italics.
          </p>
          {err("hero.heading")}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="h-text">Text</Label>
          <textarea
            id="h-text"
            rows={2}
            maxLength={240}
            value={hero.text}
            onChange={(e) => edit({ text: e.target.value })}
            className={area}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-cta">Button label</Label>
          <Input
            id="h-cta"
            value={hero.cta}
            maxLength={40}
            onChange={(e) => edit({ cta: e.target.value })}
          />
          {err("hero.cta")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-href">Button goes to</Label>
          <Input
            id="h-href"
            value={hero.ctaHref}
            maxLength={200}
            placeholder="/products?occasion=festive"
            onChange={(e) => edit({ ctaHref: e.target.value })}
          />
          {err("hero.ctaHref")}
        </div>
        {hero.layout === "arch" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="h-cap1">Caption on the photo: small line</Label>
              <Input
                id="h-cap1"
                value={hero.captionSmall}
                maxLength={40}
                onChange={(e) => edit({ captionSmall: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="h-cap2">Caption on the photo: large line</Label>
              <Input
                id="h-cap2"
                value={hero.captionBig}
                maxLength={40}
                onChange={(e) => edit({ captionBig: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
    </fieldset>
  );
}

/** Warns when the chosen colours would make text hard to read (WCAG AA, 4.5:1). */
function ContrastWarning({ colors }: { colors: ThemeColors }) {
  const hex = /^#[0-9a-f]{6}$/i;
  if (!Object.values(colors).every((c) => hex.test(c))) return null;
  const t = shopTokens(colors, "light");
  const pairs: [string, string, string][] = [
    ["Text on the background", t.ink, t.bg],
    ["Secondary text on the background", t.muted, t.bg],
    ["Button text on the main colour", t.btnfg, t.btn],
    ["Header text on the main colour", t.on, t.brand],
  ];
  const low = pairs.filter(([, a, b]) => contrast(a, b) < 4.5);
  if (low.length === 0) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      Hard to read: {low.map(([name]) => name.toLowerCase()).join("; ")}. Choose a darker text
      colour or a lighter background.
    </p>
  );
}

/** A small mock of the shop in light and dark with the chosen colours. */
function ColorPreview({ colors }: { colors: ThemeColors }) {
  const hex = /^#[0-9a-f]{6}$/i;
  if (!Object.values(colors).every((c) => hex.test(c))) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Colour preview">
      {(["light", "dark"] as const).map((mode) => {
        const t = shopTokens(colors, mode);
        return (
          <div
            key={mode}
            className="overflow-hidden rounded-md border"
            style={{ borderColor: t.line, background: t.bg, color: t.ink }}
          >
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ background: t.brand, color: t.on }}
            >
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  color: t.wordmark,
                  letterSpacing: "0.18em",
                }}
              >
                VINEET
              </span>
              <span className="text-xs">{mode === "light" ? "Light" : "Dark"}</span>
            </div>
            <div className="h-1.5" style={{ background: t.alt }} />
            <div className="space-y-2 p-3">
              <p
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: t.eyebrow }}
              >
                The festive edit
              </p>
              <p className="text-xl" style={{ color: t.head, fontFamily: "var(--font-heading)" }}>
                Gold for every <em style={{ color: t.em }}>forever</em>
              </p>
              <p className="text-xs" style={{ color: t.muted }}>
                Priced at today&apos;s gold rate.
              </p>
              <span
                className="inline-block px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase"
                style={{ background: t.btn, color: t.btnfg }}
              >
                Shop now
              </span>
              <span className="ml-2 text-sm font-bold" style={{ color: t.goldtext }}>
                ₹1,16,172
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DefaultModeForm({ initial }: { initial: ColorMode }) {
  const [mode, setMode] = useState<ColorMode>(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="border-border max-w-2xl space-y-3 rounded-lg border p-4"
      aria-label="Light or dark for new visitors"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveDefaultModeAction(mode);
          setSaved(res.ok ? "Saved." : res.error);
        });
      }}
    >
      <h2 className="text-base font-semibold">Light or dark for new visitors</h2>
      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ["system", "Follow the phone's setting"],
            ["light", "Light"],
            ["dark", "Dark"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Shoppers can always switch with the sun/moon button in the header; the shop remembers their
        choice.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {saved && (
          <span role="status" className="text-sm">
            {saved}
          </span>
        )}
      </div>
    </form>
  );
}
