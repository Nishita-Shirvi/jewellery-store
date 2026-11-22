"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadAppearanceImageAction } from "@/app/admin/appearance-actions";
import { saveEntranceAction } from "@/app/admin/entrance-actions";
import { uploadVideo } from "@/components/admin/upload-video";
import {
  DEFAULT_ENTRANCE,
  DEFAULT_POSTER,
  DEFAULT_VIDEO,
  entranceVideo,
  type EntranceSettings,
} from "@/lib/entrance";
import { cn } from "@/lib/utils";

const area =
  "border-input bg-background w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none";

/** Admin → Appearance → Sign-in & top bar. */
export function EntranceEditor({
  initial,
  imageUpload,
  videoUpload,
  maxVideoMb,
}: {
  initial: EntranceSettings;
  imageUpload: boolean;
  videoUpload: boolean;
  maxVideoMb: number;
}) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);

  const edit = (patch: Partial<EntranceSettings>) => {
    setS((p) => ({ ...p, ...patch }));
    setNotice(null);
  };
  const err = (k: string) =>
    errors[k] ? <p className="text-xs text-red-700">{errors[k]}</p> : null;

  async function sendPicture(file: File) {
    setUploading("Uploading picture…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadAppearanceImageAction(fd);
      if (res.ok) edit({ poster: res.url });
      else setNotice({ ok: false, text: res.error });
    } catch {
      setNotice({ ok: false, text: "The picture didn't upload. Try a JPG, PNG or WebP." });
    } finally {
      setUploading(null);
    }
  }

  async function sendVideo(file: File) {
    setUploading("Uploading video…");
    try {
      const res = await uploadVideo(file, maxVideoMb, (pct) =>
        setUploading(`Uploading video… ${pct}%`),
      );
      if (res.ok) edit({ videoUrl: res.url, video: true });
      else setNotice({ ok: false, text: res.error });
    } finally {
      setUploading(null);
    }
  }

  function save() {
    start(async () => {
      const res = await saveEntranceAction(s);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setNotice({ ok: false, text: res.error });
        return;
      }
      setS(res.entrance);
      setSaved(res.entrance);
      setErrors({});
      setNotice({ ok: true, text: "Saved. Shoppers see the change now." });
    });
  }

  const previewVideo = entranceVideo(s);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        aria-label="Sign-in and top bar"
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
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

        <fieldset className="space-y-4">
          <legend className="mb-3 text-base font-semibold">Top bar</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.topBar}
              onChange={(e) => edit({ topBar: e.target.checked })}
            />
            Show the tagline bar above the header
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="e-tagline">Tagline</Label>
            <Input
              id="e-tagline"
              value={s.tagline}
              maxLength={80}
              onChange={(e) => edit({ tagline: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Live announcements (Admin → Content) show beside it. On phones only the announcement
              shows, or the tagline when there is none.
            </p>
            {err("tagline")}
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-base font-semibold">Log-in and create-account pages</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.video}
              onChange={(e) => edit({ video: e.target.checked })}
            />
            Play the background video
          </label>
          <p className="text-muted-foreground text-xs">
            When it&apos;s off, or the shopper has asked their device for less motion or data
            saving, the still picture shows instead. Shoppers can pause the video.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="e-video">Video</Label>
            <div className="flex flex-wrap items-center gap-3">
              {videoUpload && (
                <input
                  id="e-video-file"
                  type="file"
                  aria-label="Upload a video"
                  accept="video/mp4,video/webm"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void sendVideo(f);
                  }}
                  className="block text-sm"
                />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={s.videoUrl === DEFAULT_VIDEO && s.poster === DEFAULT_POSTER}
                onClick={() => edit({ videoUrl: DEFAULT_VIDEO, poster: DEFAULT_POSTER })}
              >
                Use our showroom clip
              </Button>
            </div>
            <Input
              id="e-video"
              value={s.videoUrl}
              placeholder="https://res.cloudinary.com/…/video/upload/….mp4"
              onChange={(e) => edit({ videoUrl: e.target.value.trim() })}
            />
            <p className="text-muted-foreground text-xs">
              MP4 or WebM, muted, about 10–20 seconds, up to {maxVideoMb} MB
              {videoUpload ? "" : " — paste a link to a video on our Cloudinary or R2"}. It loops
              with no sound.
            </p>
            {err("videoUrl")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-poster">Still picture</Label>
            {imageUpload && (
              <input
                id="e-poster-file"
                type="file"
                aria-label="Upload a still picture"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void sendPicture(f);
                }}
                className="block text-sm"
              />
            )}
            <Input
              id="e-poster"
              value={s.poster}
              onChange={(e) => edit({ poster: e.target.value.trim() })}
            />
            <p className="text-muted-foreground text-xs">
              Shown while the video loads, and instead of it. Best: a frame from the video.
            </p>
            {err("poster")}
          </div>
          {uploading && (
            <p role="status" className="text-muted-foreground text-sm">
              {uploading}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="e-eyebrow">Small line above the heading</Label>
              <Input
                id="e-eyebrow"
                value={s.eyebrow}
                maxLength={40}
                onChange={(e) => edit({ eyebrow: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-heading">Heading</Label>
              <Input
                id="e-heading"
                value={s.heading}
                maxLength={80}
                onChange={(e) => edit({ heading: e.target.value })}
              />
              {err("heading")}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-text">Text</Label>
            <textarea
              id="e-text"
              rows={2}
              maxLength={200}
              className={area}
              value={s.text}
              onChange={(e) => edit({ text: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              The heading and text show beside the form on computers and tablets.
            </p>
          </div>
        </fieldset>

        <div className="border-border flex flex-wrap gap-3 border-t pt-5">
          <Button type="submit" disabled={pending || uploading !== null}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() => {
              setS(saved);
              setErrors({});
              setNotice(null);
            }}
          >
            Discard changes
          </Button>
          <Button type="button" variant="ghost" onClick={() => edit(DEFAULT_ENTRANCE)}>
            Back to our defaults
          </Button>
        </div>
      </form>

      <section aria-label="Preview" className="space-y-3">
        <h2 className="text-base font-semibold">Preview</h2>
        {s.topBar && s.tagline.trim() && (
          <div className="rounded-md bg-[#3a0f18] px-4 py-2 text-center text-[12.5px] tracking-wide text-[#fbf6ee]">
            {s.tagline}
          </div>
        )}
        <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
          {previewVideo ? (
            <video
              key={previewVideo}
              src={previewVideo}
              poster={s.poster}
              muted
              loop
              playsInline
              autoPlay
              aria-label="Background video preview"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of any stored link
            <img src={s.poster} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-6 left-6 max-w-[45%] text-[#fbf6ee]">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[#e9cf8f] uppercase">
              {s.eyebrow}
            </p>
            <p className="mt-1 text-xl leading-tight" style={{ fontFamily: "var(--font-display)" }}>
              {s.heading}
            </p>
            {s.text && <p className="mt-2 text-xs opacity-90">{s.text}</p>}
          </div>
          <div className="absolute inset-y-6 right-6 w-[40%] rounded bg-white/95 p-3 text-xs text-zinc-700">
            Log in form
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          You&apos;re signed in, so /login takes you to your account — open it in a private window
          to see it as shoppers do.
        </p>
      </section>
    </div>
  );
}
