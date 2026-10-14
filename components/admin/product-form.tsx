"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/auth/form-field";
import { saveProductAction, uploadImageAction, type AdminFormState } from "@/app/admin/actions";

export interface ProductFormValues {
  id?: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  price: string;
  makingCharge: string;
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
}: {
  label: string;
  name: string;
  value: string;
  options: [string, string][];
  error?: string[];
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

export function ProductForm({
  values,
  categories,
  placeholderImages,
  uploadEnabled,
}: {
  values: ProductFormValues;
  categories: { id: string; name: string }[];
  placeholderImages: string[];
  uploadEnabled: boolean;
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
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const e = state.fieldErrors ?? {};

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

  return (
    <form onSubmit={submitWithoutReset} className="space-y-8" noValidate aria-label="Product">
      {values.id && <input type="hidden" name="id" value={values.id} />}
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

      <section className="grid gap-4 md:grid-cols-2">
        <FormField label="Name" name="name" defaultValue={values.name} errors={e.name} />
        <FormField
          label="URL name (optional)"
          name="slug"
          defaultValue={values.slug}
          errors={e.slug}
          hint="Made from the name if left empty."
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
          label="Stock"
          name="stock"
          type="number"
          min={0}
          defaultValue={values.stock}
          errors={e.stock}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FormField
          label="Price (₹, incl. GST)"
          name="price"
          inputMode="decimal"
          defaultValue={values.price}
          errors={e.price}
        />
        <FormField
          label="Making charge (₹, optional)"
          name="makingCharge"
          inputMode="decimal"
          defaultValue={values.makingCharge}
          errors={e.makingCharge}
        />
        <div />
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
        <div className="md:col-span-3">
          <FormField
            label="Stones (optional)"
            name="gemstone"
            defaultValue={values.gemstone}
            errors={e.gemstone}
          />
        </div>
      </section>

      <section aria-labelledby="images-heading" className="space-y-3">
        <h2 id="images-heading" className="text-sm font-semibold">
          Images
        </h2>
        {images.length > 0 ? (
          <ul className="flex flex-wrap gap-3">
            {images.map((src, i) => (
              <li key={`${src}-${i}`} className="w-24 space-y-1">
                <div className="border-border bg-muted overflow-hidden rounded border">
                  <Image
                    src={src}
                    alt=""
                    width={96}
                    height={96}
                    unoptimized
                    className="aspect-square object-cover"
                  />
                </div>
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No images yet.</p>
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
                aria-label="Upload an image"
                disabled={uploading}
                onChange={(ev) => ev.target.files?.[0] && upload(ev.target.files[0])}
              />
              {uploading && <span className="text-muted-foreground text-sm">Uploading…</span>}
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              Uploads switch on when Cloudinary keys are added. For now, pick a placeholder:
            </p>
          )}
          <select
            aria-label="Add a placeholder image"
            className={selectClass + " w-auto"}
            value=""
            onChange={(ev) => ev.target.value && setImages([...images, ev.target.value])}
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
      </section>

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

      <Button type="submit" disabled={pending || uploading}>
        {pending ? "Saving…" : values.id ? "Save changes" : "Create product"}
      </Button>
    </form>
  );
}
