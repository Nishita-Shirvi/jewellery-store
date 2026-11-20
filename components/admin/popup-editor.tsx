"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PopupCard } from "@/components/popup/site-popup";
import { uploadAppearanceImageAction } from "@/app/admin/appearance-actions";
import { savePopupAction } from "@/app/admin/popup-actions";
import {
  DEFAULT_POPUP,
  POPUP_ACTIONS,
  POPUP_AGAIN,
  POPUP_DELAYS,
  popupLive,
  type PopupAction,
  type PopupDelay,
  type PopupSettings,
} from "@/lib/popup";
import { cn } from "@/lib/utils";

const select = "border-input bg-background block h-9 w-full rounded-md border px-2 text-sm";
const area =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

const PHOTOS = [
  { url: "/images/editorial/bridal-set.jpg", label: "Bridal set on red silk" },
  { url: "/images/editorial/kundan-necklace.jpg", label: "Kundan necklace" },
  { url: "/images/editorial/bangles.jpg", label: "Kundan bangles" },
  { url: "/images/editorial/solitaire-rings.jpg", label: "Solitaire rings" },
];

/** Admin → Appearance → Popup: words, picture, what it asks for, when and how often. */
export function PopupEditor({
  initial,
  today,
  siteName,
  days,
  imageUpload,
  visitBooking,
}: {
  initial: PopupSettings;
  today: string;
  siteName: string;
  days: { value: string; label: string }[];
  imageUpload: boolean;
  visitBooking: boolean;
}) {
  const [popup, setPopup] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(popup) !== JSON.stringify(saved);

  const edit = (patch: Partial<PopupSettings>) => {
    setPopup((p) => ({ ...p, ...patch }));
    setNotice(null);
  };
  const err = (k: string) =>
    errors[k] ? <p className="text-xs text-red-700">{errors[k]}</p> : null;

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadAppearanceImageAction(fd);
      if (res.ok) edit({ image: res.url });
      else setNotice({ ok: false, text: res.error });
    } catch {
      setNotice({ ok: false, text: "The picture didn't upload. Try a JPG, PNG or WebP." });
    } finally {
      setUploading(false);
    }
  }

  function save() {
    start(async () => {
      const res = await savePopupAction(popup);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setNotice({ ok: false, text: res.error });
        return;
      }
      setPopup(res.popup);
      setSaved(res.popup);
      setErrors({});
      setNotice({
        ok: true,
        text: res.popup.on
          ? popupLive(res.popup, today)
            ? "Saved. Shoppers see the new popup now (even those who closed the old one)."
            : "Saved. It shows on its start date."
          : "Saved. The popup is off.",
      });
    });
  }

  const status = !saved.on
    ? { label: "Off", tone: "bg-zinc-200 text-zinc-700" }
    : saved.action === "visit" && !visitBooking
      ? { label: "Hidden: visit booking is switched off", tone: "bg-amber-100 text-amber-900" }
      : popupLive(saved, today)
        ? { label: "Live now", tone: "bg-emerald-100 text-emerald-900" }
        : saved.until && saved.until < today
          ? { label: "Ended", tone: "bg-zinc-200 text-zinc-700" }
          : { label: `Starts ${saved.from}`, tone: "bg-sky-100 text-sky-900" };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        aria-label="Popup"
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="flex items-center gap-2 text-sm">
          Now:{" "}
          <span className={cn("rounded px-1.5 py-0.5 text-xs", status.tone)}>{status.label}</span>
        </p>
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
          <legend className="mb-3 text-base font-semibold">When</legend>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input
              type="checkbox"
              checked={popup.on}
              onChange={(e) => edit({ on: e.target.checked })}
            />
            Show the popup
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="p-from">From (optional)</Label>
            <Input
              id="p-from"
              type="date"
              value={popup.from}
              onChange={(e) => edit({ from: e.target.value })}
            />
            {err("from")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-until">Until (optional)</Label>
            <Input
              id="p-until"
              type="date"
              value={popup.until}
              onChange={(e) => edit({ until: e.target.value })}
            />
            {err("until")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-where">On</Label>
            <select
              id="p-where"
              className={select}
              value={popup.where}
              onChange={(e) => edit({ where: e.target.value as "home" | "all" })}
            >
              <option value="home">The home page</option>
              <option value="all">Every shop page</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-delay">Opens</Label>
            <select
              id="p-delay"
              className={select}
              value={popup.delay}
              onChange={(e) => edit({ delay: e.target.value as PopupDelay })}
            >
              {POPUP_DELAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-again">Show again</Label>
            <select
              id="p-again"
              className={select}
              value={popup.againDays}
              onChange={(e) => edit({ againDays: Number(e.target.value) })}
            >
              {POPUP_AGAIN.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-muted-foreground text-xs sm:col-span-3">
            Never on cart, checkout, sign-in, account or admin pages. Each save shows the popup
            again to shoppers who closed the old one.
          </p>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-base font-semibold">Picture and words</legend>
          <div className="flex flex-wrap items-end gap-3">
            {imageUpload && (
              <div className="space-y-1.5">
                <Label htmlFor="p-img">Picture</Label>
                <input
                  id="p-img"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void upload(f);
                  }}
                  className="block text-sm"
                />
              </div>
            )}
            <select
              aria-label="Or use one of our photos"
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              value={PHOTOS.some((p) => p.url === popup.image) ? popup.image : ""}
              onChange={(e) => e.target.value && edit({ image: e.target.value })}
            >
              <option value="">Or use one of our photos…</option>
              {PHOTOS.map((p) => (
                <option key={p.url} value={p.url}>
                  {p.label}
                </option>
              ))}
            </select>
            {uploading && (
              <span role="status" className="text-muted-foreground text-sm">
                Uploading…
              </span>
            )}
          </div>
          {err("image")}
          <div className="space-y-1.5">
            <Label htmlFor="p-alt">Describe the picture (for screen readers)</Label>
            <Input
              id="p-alt"
              value={popup.imageAlt}
              maxLength={160}
              onChange={(e) => edit({ imageAlt: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-eyebrow">Small line above the heading</Label>
              <Input
                id="p-eyebrow"
                value={popup.eyebrow}
                maxLength={60}
                onChange={(e) => edit({ eyebrow: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-heading">Heading</Label>
              <Input
                id="p-heading"
                value={popup.heading}
                maxLength={90}
                onChange={(e) => edit({ heading: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">
                Put *stars* around words to show them in italics.
              </p>
              {err("heading")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-text">Text</Label>
            <textarea
              id="p-text"
              rows={2}
              maxLength={220}
              className={area}
              value={popup.text}
              onChange={(e) => edit({ text: e.target.value })}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-base font-semibold">What it asks for</legend>
          <div className="space-y-2">
            {POPUP_ACTIONS.map((a) => (
              <label key={a.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="p-action"
                  checked={popup.action === a.value}
                  disabled={a.value === "visit" && !visitBooking}
                  onChange={() => edit({ action: a.value as PopupAction })}
                />
                {a.label}
                {a.value === "visit" && !visitBooking && (
                  <span className="text-muted-foreground text-xs">(visit booking is off)</span>
                )}
              </label>
            ))}
            {err("action")}
          </div>
          <p className="text-muted-foreground text-xs">
            Visit requests go to Admin → Visits; newsletter sign-ups get the usual confirmation
            email and appear in Marketing once confirmed.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-cta">Button label</Label>
              <Input
                id="p-cta"
                value={popup.cta}
                maxLength={36}
                onChange={(e) => edit({ cta: e.target.value })}
              />
              {err("cta")}
            </div>
            {popup.action === "link" && (
              <div className="space-y-1.5">
                <Label htmlFor="p-link">Button goes to</Label>
                <Input
                  id="p-link"
                  value={popup.link}
                  maxLength={200}
                  placeholder="/products?occasion=bridal"
                  onChange={(e) => edit({ link: e.target.value })}
                />
                {err("link")}
              </div>
            )}
          </div>
        </fieldset>

        <div className="border-border flex flex-wrap gap-3 border-t pt-5">
          <Button type="submit" disabled={pending || uploading}>
            {pending ? "Saving…" : "Save popup"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() => {
              setPopup(saved);
              setErrors({});
              setNotice(null);
            }}
          >
            Discard changes
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setPopup({
                ...DEFAULT_POPUP,
                // Without visit booking the example asks for the newsletter instead.
                ...(visitBooking ? {} : { action: "news" as const, cta: "Keep me posted" }),
                on: popup.on,
                version: saved.version,
              })
            }
          >
            Start from the private-viewing example
          </Button>
        </div>
      </form>

      <section aria-label="Preview" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Preview</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} />{" "}
            Phone width
          </label>
        </div>
        <div className="bg-muted/60 rounded-lg p-4">
          <div
            inert
            className={cn("vj-pop-preview mx-auto", narrow ? "max-w-[360px]" : "max-w-[900px]")}
          >
            <PopupCard
              key={`${popup.action}-${popup.heading}`}
              popup={popup}
              siteName={siteName}
              days={days}
              preview
              headingId="vj-pop-preview-h"
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          The preview uses today&apos;s theme colours in light mode; shoppers see the live theme and
          their own light/dark choice.
        </p>
      </section>
    </div>
  );
}
