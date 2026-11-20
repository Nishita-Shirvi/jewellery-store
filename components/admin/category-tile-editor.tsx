"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TileArt } from "@/components/home/category-tiles";
import { imageAspect, removeBackground } from "@/components/admin/cutout";
import { saveCategoryTileAction, uploadTileImageAction } from "@/app/admin/category-tile-actions";
import {
  TILE_BOX,
  TILE_MODELS,
  ownModelPhoto,
  clampAr,
  placeDefault,
  type CategoryTile,
  type TileModel,
} from "@/lib/tiles";
import { cn } from "@/lib/utils";

const BLANK: CategoryTile = {
  model: "bust",
  piece: "",
  ar: 1,
  cx: 150,
  cy: 200,
  w: 130,
  rot: 0,
  zoom: "",
  zoomAlt: "",
  modelPhoto: "",
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

async function upload(file: Blob, name: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", new File([file], name, { type: file.type || "image/png" }));
  const res = await uploadTileImageAction(fd);
  if (!res.ok) throw new Error(res.error);
  return res.url;
}

/**
 * Admin → Categories → Tile: upload one product photo, its background is removed here in the
 * browser, it's placed on the display model, and the admin drags, sizes and turns it into place.
 * Or upload a photo of a real model wearing the piece.
 */
export function CategoryTileEditor({
  category,
  saved,
  sample,
  uploadEnabled,
}: {
  category: { id: string; name: string; image: string };
  /** The admin's own tile, if any ("none" model included). */
  saved: CategoryTile | null;
  /** The sample tile for this category's name, if there is one. */
  sample: CategoryTile | null;
  uploadEnabled: boolean;
}) {
  const [tile, setTile] = useState<CategoryTile>(saved ?? sample ?? BLANK);
  const [isOwn, setIsOwn] = useState(saved !== null);
  const [dirty, setDirty] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alreadyCut, setAlreadyCut] = useState(false);
  const [pending, start] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ dx: number; dy: number; mirrored: boolean } | null>(null);

  function change(patch: Partial<CategoryTile>) {
    setTile((t) => ({ ...t, ...patch }));
    setDirty(true);
    setMessage(null);
  }

  function svgPoint(e: React.PointerEvent) {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function move(e: React.PointerEvent) {
    if (!drag.current) return;
    const p = svgPoint(e);
    if (!p) return;
    let x = p.x + drag.current.dx;
    if (drag.current.mirrored) x = TILE_BOX.width - x;
    change({
      cx: clamp(Math.round(x), 0, TILE_BOX.width),
      cy: clamp(Math.round(p.y + drag.current.dy), 0, TILE_BOX.height),
    });
  }
  const canPlace = tile.piece !== "" && !ownModelPhoto(tile) && tile.model !== "none";
  const svgProps: React.SVGProps<SVGSVGElement> = canPlace
    ? {
        ref: svgRef,
        tabIndex: 0,
        role: "img",
        "aria-hidden": false,
        "aria-label": `Where the piece sits on the model. Drag it, or use the arrow keys (Shift for bigger steps). Now at ${tile.cx}, ${tile.cy}.`,
        className: "vj-model cursor-grab touch-none active:cursor-grabbing focus-visible:outline-2",
        onPointerDown: (e) => {
          const p = svgPoint(e);
          if (!p) return;
          const mirrored = tile.model === "head" && p.x > TILE_BOX.width / 2;
          const at = mirrored ? TILE_BOX.width - tile.cx : tile.cx;
          drag.current = { dx: at - p.x, dy: tile.cy - p.y, mirrored };
          // Pressing away from the piece moves it there.
          if (Math.hypot(drag.current.dx, drag.current.dy) > Math.max(30, tile.w * 0.7)) {
            drag.current.dx = 0;
            drag.current.dy = 0;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
          e.preventDefault();
        },
        onPointerMove: move,
        onPointerUp: () => (drag.current = null),
        onPointerCancel: () => (drag.current = null),
        onKeyDown: (e) => {
          const k = (
            {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            } as Record<string, [number, number]>
          )[e.key];
          if (!k) return;
          e.preventDefault();
          const s = e.shiftKey ? 10 : 2;
          change({
            cx: clamp(tile.cx + k[0] * s, 0, TILE_BOX.width),
            cy: clamp(tile.cy + k[1] * s, 0, TILE_BOX.height),
          });
        },
      }
    : {};

  async function onProductPhoto(file: File) {
    setErrors({});
    setBusy(alreadyCut ? "Uploading…" : "Removing the background…");
    try {
      const cut = alreadyCut
        ? { blob: file as Blob, ar: await imageAspect(file) }
        : await removeBackground(file);
      setBusy("Uploading…");
      const [piece, zoom] = await Promise.all([
        upload(cut.blob, "piece.png"),
        alreadyCut ? Promise.resolve("") : upload(file, file.name),
      ]);
      const ar = clampAr(cut.ar);
      // A new piece gets its own hover photo and description (never the sample's).
      setTile((t) => {
        const model: TileModel = t.model === "photo" || t.model === "none" ? "bust" : t.model;
        return { ...t, piece, ar, model, ...placeDefault(model, ar), zoom, zoomAlt: category.name };
      });
      setDirty(true);
      setMessage({
        ok: true,
        text: "Placed on the model. Drag it into position, then press Save tile.",
      });
    } catch (error) {
      setMessage({
        ok: false,
        text:
          error instanceof Error && error.message && !/PNG failed/.test(error.message)
            ? error.message
            : "Couldn't use that photo. Try a JPG or PNG under the size limit.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function onPhoto(file: File, field: "zoom" | "modelPhoto") {
    setBusy("Uploading…");
    try {
      const url = await upload(file, file.name);
      change(field === "zoom" ? { zoom: url } : { modelPhoto: url, model: "photo" });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setBusy(null);
    }
  }

  function save(next: CategoryTile | null) {
    start(async () => {
      const res = await saveCategoryTileAction(category.id, next);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setMessage({ ok: false, text: res.error });
        return;
      }
      setErrors({});
      setDirty(false);
      if (next === null) {
        setTile(sample ?? BLANK);
        setIsOwn(false);
        setMessage({
          ok: true,
          text: sample ? "Back to the sample tile." : "Back to the plain category photo.",
        });
      } else {
        setIsOwn(true);
        setMessage({ ok: true, text: "Saved. The home page shows the new tile." });
      }
    });
  }

  const err = (k: string) =>
    errors[k] ? <p className="text-xs text-red-700">{errors[k]}</p> : null;
  const shownFields = ["piece", "modelPhoto", "zoom"];
  const otherErrors = Object.entries(errors).filter(([k]) => !shownFields.includes(k));
  const needsPiece = ["bust", "head", "hand"].includes(tile.model) && tile.piece === "";
  const shown = tile.model === "none" ? null : tile;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(200px,260px)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className={cn("vj-cat", zoomed && "is-zoom")}>
          <TileArt
            tile={shown}
            image={category.image}
            alt={tile.zoomAlt || category.name}
            uid={`a${category.id}`}
            sizes="260px"
            svgProps={svgProps}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={zoomed}
          onClick={() => setZoomed((z) => !z)}
        >
          {zoomed ? "Back to the model" : "Show the hover photo"}
        </Button>
        <p className="text-muted-foreground text-xs">
          {isOwn
            ? "Your own tile."
            : sample
              ? "Sample tile (stock photo) until you save your own."
              : "Plain category photo until you save a tile."}
        </p>
      </div>

      <div className="min-w-0 space-y-4 text-sm">
        <div className="space-y-1.5">
          <Label htmlFor={`tm-${category.id}`}>Display model</Label>
          <select
            id={`tm-${category.id}`}
            value={tile.model}
            disabled={!!busy}
            onChange={(e) => {
              const model = e.target.value as TileModel;
              change({
                model,
                ...(model === "photo" || model === "none" ? {} : placeDefault(model, tile.ar)),
              });
            }}
            className="border-input bg-background block h-9 w-full max-w-md rounded-md border px-2 text-sm"
          >
            {TILE_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {tile.model !== "none" && tile.model !== "photo" && (
          <div className="space-y-1.5">
            <Label htmlFor={`tp-${category.id}`}>Product photo</Label>
            {uploadEnabled ? (
              <>
                <input
                  id={`tp-${category.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onProductPhoto(f);
                  }}
                  className="block text-sm"
                />
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={alreadyCut}
                    onChange={(e) => setAlreadyCut(e.target.checked)}
                  />
                  This photo already has a transparent background (PNG)
                </label>
                <p className="text-muted-foreground text-xs">
                  One piece, photographed from the front on a plain background, works best. The
                  background is removed here, the piece is placed on the model, and the photo itself
                  becomes the hover photo.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-xs">
                Uploads switch on when Cloudinary or R2 is set up (config/images.ini).
              </p>
            )}
            {err("piece")}
          </div>
        )}

        {tile.model === "photo" && (
          <div className="space-y-1.5">
            <Label htmlFor={`tmp-${category.id}`}>Photo of a model wearing the piece</Label>
            {uploadEnabled && (
              <input
                id={`tmp-${category.id}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onPhoto(f, "modelPhoto");
                }}
                className="block text-sm"
              />
            )}
            <p className="text-muted-foreground text-xs">
              Portrait (3:4) works best. The velvet bust shows until you add one.
            </p>
            {err("modelPhoto")}
          </div>
        )}

        {canPlace && (
          <div className="grid max-w-md gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`ts-${category.id}`}>Size</Label>
              <input
                id={`ts-${category.id}`}
                type="range"
                min={10}
                max={300}
                value={tile.w}
                onChange={(e) => change({ w: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`tr-${category.id}`}>Turn</Label>
              <input
                id={`tr-${category.id}`}
                type="range"
                min={-180}
                max={180}
                value={tile.rot}
                onChange={(e) => change({ rot: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <p className="text-muted-foreground text-xs sm:col-span-2">
              Drag the piece on the model to move it.{" "}
              {tile.model === "head" && "Earrings show on both ears."}
            </p>
          </div>
        )}

        {tile.model !== "none" && (
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`tz-${category.id}`}>Hover photo</Label>
              {uploadEnabled && (
                <input
                  id={`tz-${category.id}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void onPhoto(f, "zoom");
                  }}
                  className="block text-sm"
                />
              )}
              {tile.zoom && (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => change({ zoom: "" })}
                >
                  Use the category photo instead
                </button>
              )}
              {err("zoom")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ta-${category.id}`}>Describe the hover photo</Label>
              <Input
                id={`ta-${category.id}`}
                value={tile.zoomAlt}
                maxLength={160}
                placeholder={category.name}
                onChange={(e) => change({ zoomAlt: e.target.value })}
              />
            </div>
          </div>
        )}

        {busy && (
          <p role="status" className="text-muted-foreground">
            {busy}
          </p>
        )}
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={message.ok ? "text-emerald-700" : "text-red-700"}
          >
            {message.text}
          </p>
        )}
        {otherErrors.length > 0 && (
          <ul role="alert" className="list-disc pl-5 text-xs text-red-700">
            {otherErrors.map(([k, m]) => (
              <li key={k}>
                {k}: {m}
              </li>
            ))}
          </ul>
        )}
        {needsPiece && (
          <p className="text-muted-foreground text-xs">
            Upload a product photo to put on the model, or choose No model.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending || !!busy || needsPiece || (!dirty && isOwn)}
            onClick={() => save(tile)}
          >
            {pending ? "Saving…" : "Save tile"}
          </Button>
          {isOwn && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => save(null)}
            >
              {sample ? "Back to the sample tile" : "Back to the plain photo"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
