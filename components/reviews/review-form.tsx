"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitReviewAction, uploadReviewPhotoAction } from "@/app/products/review-actions";

export function ReviewForm({
  productId,
  slug,
  initial,
  uploadEnabled,
}: {
  productId: string;
  slug: string;
  initial?: { rating: number; title: string; body: string; images: string[] };
  uploadEnabled: boolean;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitReviewAction({ productId, rating, title, body, images }, slug);
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
        setErrors(res.fieldErrors ?? {});
      }
    });
  }

  function upload(file: File) {
    const data = new FormData();
    data.append("file", file);
    start(async () => {
      const res = await uploadReviewPhotoAction(data);
      if (res.ok) setImages((cur) => [...cur, res.url].slice(0, 3));
      else setError(res.error);
    });
  }

  if (done) {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
      >
        Thank you! Your review will appear once our team has checked it.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border-border max-w-xl space-y-4 rounded-md border p-5"
      aria-label="Write a review"
      noValidate
    >
      <fieldset>
        <legend className="text-sm font-medium">Your rating</legend>
        <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              className="text-gold focus-visible:ring-ring rounded p-0.5 focus-visible:ring-2"
            >
              <Star
                width={26}
                height={26}
                className={n <= rating ? "fill-current" : "opacity-35"}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        {errors.rating && <p className="mt-1 text-xs text-red-700">{errors.rating[0]}</p>}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="review-title">Title</Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
        />
        {errors.title && <p className="text-xs text-red-700">{errors.title[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="review-body">Your review</Label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
        {errors.body && <p className="text-xs text-red-700">{errors.body[0]}</p>}
      </div>
      {uploadEnabled && (
        <div className="space-y-1.5">
          <Label htmlFor="review-photo">Photos (optional, up to 3)</Label>
          <input
            id="review-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
            disabled={images.length >= 3}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          {images.length > 0 && (
            <p className="text-xs text-emerald-700">{images.length} photo(s) added.</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : initial ? "Update review" : "Submit review"}
      </Button>
    </form>
  );
}
