"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import { reviewSchema } from "@/lib/reviews";
import { ReviewError, submitReview } from "@/services/review.service";
import { UploadError, uploadImage } from "@/services/upload.service";

export type ReviewFormResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

export async function submitReviewAction(input: unknown, slug: string): Promise<ReviewFormResult> {
  const user = await requireUser();
  if (!rateLimit(`review:${user.id}`, 10, 60 * 60 * 1000).ok)
    return { ok: false, error: "Too many reviews in a short time. Please try later." };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: "Please check your review.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  try {
    await submitReview(user, parsed.data);
  } catch (error) {
    if (error instanceof ReviewError) return { ok: false, error: error.message };
    throw error;
  }
  if (/^[a-z0-9-]{1,120}$/.test(slug)) revalidatePath(`/products/${slug}`);
  return { ok: true };
}

export async function uploadReviewPhotoAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!rateLimit(`review-photo:${user.id}`, 10, 60 * 60 * 1000).ok)
    return { ok: false, error: "Too many uploads. Try again later." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a photo." };
  try {
    return { ok: true, url: await uploadImage(file, "jewellery-store/reviews") };
  } catch (error) {
    return { ok: false, error: error instanceof UploadError ? error.message : "Upload failed." };
  }
}
