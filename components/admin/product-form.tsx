"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { saveProductAction, uploadImageAction, type AdminFormState } from "@/app/admin/actions";
import { OCCASIONS, occasionLabel } from "@/lib/storefront";

export interface ProductFormValues {
  id?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  pricingMode: "FIXED" | "RATE_LINKED";
  price: string;
  makingCharge: string;
  stoneCharge: string;
  stock: string;
  metalType: string;
  purity: string;
  metalColour: string;
  netWeight: string;
  grossWeight: string;
  gemstone: string;
  huid: string;
  hsnCode: string;
  gstRate: string;
  images: string[];
  occasions: string[];
  /** One per line or comma-separated. */
  sizes: string;
  spinVideoUrl: string;
  isActive: boolean;
  isFeatured: boolean;
  isReturnable: boolean;
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Select({
  label,
  name,
  value,
  options,
  error,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: [string, string][];
  error?: string[];
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value}
        className={selectClass}
        aria-invalid={error ? true : undefined}
        onChange={onChange ? (ev) => onChange(ev.target.value) : undefined}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-700">{error[0]}</p>}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border space-y-4 rounded-md border p-4 md:p-5">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Moves item i by `delta` places (used to reorder images; the first one is the main photo). */
function move<T>(list: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function ProductForm({
  values,
  categories,
  placeholderImages,
  uploadEnabled,
  ratesAvailable,
}: {
  values: ProductFormValues;
  categories: { id: string; name: string }[];
  placeholderImages: string[];
  uploadEnabled: boolean;
  /** Purities that have a metal rate (rate-linked pricing needs one). */
  ratesAvailable: string[];
}) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(
    saveProductAction,
    {},
  );
  // Submit without React's automatic form reset, so fields always keep what the admin typed.
  const [, startSubmit] = useTransition();
  const submitWithoutReset = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startSubmit(() => formAction(data));
  };
  const [images, setImages] = useState<string[]>(values.images);
  const [pricingMode, setPricingMode] = useState(values.pricingMode);
  const [purity, setPurity] = useState(values.purity);
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const e = state.fieldErrors ?? {};
  const rateLinked = pricingMode === "RATE_LINKED";
  const missingRate = rateLinked && !ratesAvailable.includes(purity);

  function upload(file: File) {
    setUploadError(null);
    const data = new FormData();
    data.append("file", file);
    startUpload(async () => {
      const res = await uploadImageAction(data);
      if (res.ok) setImages((current) => [...current, res.url]);
      else setUploadError(res.error);
      if (fileInput.current) fileInput.current.value = "";
    });
  }

  function addImage(src: string) {
    setImages((current) => (current.includes(src) ? current : [...current, src]));
  }

  return (
    <form onSubmit={submitWithoutReset} className="space-y-6" noValidate aria-label="Product">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.id && <input type="hidden" name="stockOriginal" value={values.stock} />}
      <input type="hidden" name="images" value={images.join("\n")} />

      {(state.error || state.message) && (
        <p
          role={state.error ? "alert" : "status"}
          className={
            state.error
              ? "rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              : "rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          }
        >
          {state.error ?? state.message}
        </p>
      )}

      <Section title="Basics">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Name" name="name" defaultValue={values.name} errors={e.name} />
          <FormField
            label="URL name (optional)"
            name="slug"
            defaultValue={values.slug}
            errors={e.slug}
            hint={
              values.id
                ? "Changing it keeps the old link working (it redirects)."
                : "Made from the name if left empty."
            }
          />
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              name="description"
              defaultValue={values.description}
              rows={4}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              aria-invalid={e.description ? true : undefined}
            />
            {e.description && <p className="text-xs text-red-700">{e.description[0]}</p>}
          </div>
          <Select
            label="Category"
            name="categoryId"
            value={values.categoryId}
            options={categories.map((c) => [c.id, c.name])}
            error={e.categoryId}
          />
          <FormField
            label="Stock (pieces)"
            name="stock"
            type="number"
            min={0}
            defaultValue={values.stock}
            errors={e.stock}
            hint="Shared by all sizes."
          />
        </div>
      </Section>

      <Section
        title="Metal and stones"
        hint="Weights in grams, up to 3 decimals. Rate-linked prices use the net weight."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Metal"
            name="metalType"
            value={values.metalType}
            options={[
              ["GOLD", "Gold"],
              ["SILVER", "Silver"],
              ["PLATINUM", "Platinum"],
            ]}
            error={e.metalType}
          />
          <Select
            label="Purity"
            name="purity"
            value={values.purity}
            onChange={setPurity}
            options={[
              ["K22", "22K"],
              ["K18", "18K"],
              ["K14", "14K"],
              ["K24", "24K"],
              ["S925", "925 silver"],
              ["PT950", "PT950"],
            ]}
            error={e.purity}
          />
          <Select
            label="Colour"
            name="metalColour"
            value={values.metalColour}
            options={[
              ["YELLOW", "Yellow"],
              ["WHITE", "White"],
              ["ROSE", "Rose"],
              ["SILVER", "Silver"],
            ]}
            error={e.metalColour}
          />
          <FormField
            label="Net weight (g)"
            name="netWeight"
            inputMode="decimal"
            defaultValue={values.netWeight}
            errors={e.netWeight}
          />
          <FormField
            label="Gross weight (g, optional)"
            name="grossWeight"
            inputMode="decimal"
            defaultValue={values.grossWeight}
            errors={e.grossWeight}
          />
          <FormField
            label="BIS HUID (optional)"
            name="huid"
            maxLength={6}
            defaultValue={values.huid}
            errors={e.huid}
          />
          <div className="md:col-span-3">
            <FormField
              label="Stones (optional)"
              name="gemstone"
              defaultValue={values.gemstone}
              errors={e.gemstone}
            />
          </div>
        </div>
      </Section>

      <Section title="Price and tax">
        <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <legend className="sr-only">How is the price set?</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pricingMode"
              value="FIXED"
              checked={!rateLinked}
              onChange={() => setPricingMode("FIXED")}
            />
            Fixed price
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pricingMode"
              value="RATE_LINKED"
              checked={rateLinked}
              onChange={() => setPricingMode("RATE_LINKED")}
            />
            Follows today&apos;s metal rate
          </label>
        </fieldset>
        {rateLinked && (
          <p
            className={`rounded-md border p-3 text-xs ${missingRate ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border bg-muted"}`}
          >
            {missingRate
              ? "There is no rate for this purity yet. Add it in Admin → Gold rates first, or use a fixed price."
              : "Price = (net weight × today's rate + making + stones) + GST, rounded to the rupee. It updates automatically whenever you save new rates."}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {rateLinked ? (
            <div className="space-y-1.5">
              <Label htmlFor="price-preview">Price (₹, incl. GST)</Label>
              <input
                id="price-preview"
                disabled
                value={values.pricingMode === "RATE_LINKED" ? values.price : "Calculated on save"}
                className={selectClass + " bg-muted"}
              />
            </div>
          ) : (
            <FormField
              label="Price (₹, incl. GST)"
              name="price"
              inputMode="decimal"
              defaultValue={values.price}
              errors={e.price}
            />
          )}
          <FormField
            label="Making charge (₹)"
            name="makingCharge"
            inputMode="decimal"
            defaultValue={values.makingCharge}
            errors={e.makingCharge}
            hint={rateLinked ? "Added before GST." : "Optional, for your records."}
          />
          <FormField
            label="Stone charge (₹)"
            name="stoneCharge"
            inputMode="decimal"
            defaultValue={values.stoneCharge}
            errors={e.stoneCharge}
            hint={rateLinked ? "Stones, enamel, etc. Added before GST." : "Optional."}
          />
          <FormField
            label="HSN code"
            name="hsnCode"
            inputMode="numeric"
            defaultValue={values.hsnCode}
            errors={e.hsnCode}
          />
          <FormField
            label="GST rate (%)"
            name="gstRate"
            inputMode="decimal"
            defaultValue={values.gstRate}
            errors={e.gstRate}
            hint="Prices include GST. Jewellery: 3%."
          />
        </div>
      </Section>

      <Section
        title="Occasions and sizes"
        hint="Occasions power the occasion filters, home page tiles and style advisor."
      >
        <fieldset>
          <legend className="text-sm font-medium">Occasions</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {OCCASIONS.map((o) => (
              <label key={o} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="occasions"
                  value={o}
                  defaultChecked={values.occasions.includes(o)}
                />
                {occasionLabel[o]}
              </label>
            ))}
          </div>
          {e.occasions && <p className="mt-1 text-xs text-red-700">{e.occasions[0]}</p>}
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="sizes">Sizes (optional)</Label>
          <textarea
            id="sizes"
            name="sizes"
            defaultValue={values.sizes}
            rows={2}
            placeholder="e.g. 10, 12, 14, 16 for rings or 2.4, 2.6, 2.8 for bangles"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            aria-invalid={e.sizes ? true : undefined}
            aria-describedby="sizes-hint"
          />
          <p id="sizes-hint" className="text-muted-foreground text-xs">
            Leave empty for one-size pieces. When set, customers must pick a size.
          </p>
          {e.sizes && <p className="text-xs text-red-700">{e.sizes[0]}</p>}
        </div>
      </Section>

      <Section
        title="Photos and video"
        hint="The first photo is the main one on cards and at the top of the product page."
      >
        {images.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {images.map((src, i) => (
              <li key={src} className="w-28 space-y-1">
                <div className="border-border bg-muted relative overflow-hidden rounded border">
                  <Image
                    src={src}
                    alt={`Photo ${i + 1}`}
                    width={112}
                    height={112}
                    unoptimized
                    className="aspect-square object-cover"
                  />
                  {i === 0 && (
                    <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 text-[10px]">
                      Main
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    className="hover:bg-accent rounded p-1 disabled:opacity-30"
                    aria-label={`Move photo ${i + 1} earlier`}
                    disabled={i === 0}
                    onClick={() => setImages(move(images, i, -1))}
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setImages(images.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="hover:bg-accent rounded p-1 disabled:opacity-30"
                    aria-label={`Move photo ${i + 1} later`}
                    disabled={i === images.length - 1}
                    onClick={() => setImages(move(images, i, 1))}
                  >
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No photos yet.</p>
        )}
        {e.images && <p className="text-xs text-red-700">{e.images[0]}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {uploadEnabled ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="text-sm"
                aria-label="Upload a photo"
                disabled={uploading}
                onChange={(ev) => ev.target.files?.[0] && upload(ev.target.files[0])}
              />
              {uploading && <span className="text-muted-foreground text-sm">Uploading…</span>}
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              Uploads switch on when image storage is set up (config/images.ini). For now, pick a
              placeholder:
            </p>
          )}
          <select
            aria-label="Add a placeholder image"
            className={selectClass + " w-auto"}
            value=""
            onChange={(ev) => ev.target.value && addImage(ev.target.value)}
          >
            <option value="">+ Add placeholder image</option>
            {placeholderImages.map((src) => (
              <option key={src} value={src}>
                {src.split("/").pop()}
              </option>
            ))}
          </select>
        </div>
        {uploadError && (
          <p role="alert" className="text-xs text-red-700">
            {uploadError}
          </p>
        )}
        <FormField
          label="360° video link (optional)"
          name="spinVideoUrl"
          defaultValue={values.spinVideoUrl}
          errors={e.spinVideoUrl}
          hint="An .mp4 or .webm of the piece on a turntable, uploaded to your Cloudinary or R2. Plays muted and looped on the product page."
        />
      </Section>

      <fieldset className="flex flex-wrap gap-6 text-sm">
        <legend className="sr-only">Options</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={values.isActive} /> Visible in
          store
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isFeatured" defaultChecked={values.isFeatured} /> Featured on
          home page
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isReturnable" defaultChecked={values.isReturnable} />{" "}
          Returnable
        </label>
      </fieldset>

      <Button type="submit" disabled={pending || uploading || missingRate}>
        {pending ? "Saving…" : values.id ? "Save changes" : "Create product"}
      </Button>
    </form>
  );
}
