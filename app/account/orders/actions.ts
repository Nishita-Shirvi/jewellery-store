"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import { orderIdSchema, returnRequestSchema } from "@/lib/validation/checkout";
import { ReturnError, cancelPaidOrder, requestReturn } from "@/services/return.service";
import { UploadError, uploadImage } from "@/services/upload.service";

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = orderIdSchema.safeParse({ orderId: formData.get("orderId") });
  if (!parsed.success) return;
  try {
    // userId scopes the lookup: customers can only cancel their own orders.
    await cancelPaidOrder({
      orderId: parsed.data.orderId,
      by: "customer",
      actorId: user.id,
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof ReturnError)
      redirect(`/account/orders/${parsed.data.orderId}?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(`/account/orders/${parsed.data.orderId}`);
  redirect(`/account/orders/${parsed.data.orderId}?cancelled=1`);
}

export type ReturnFormResult = { ok: true } | { ok: false; error: string };

export async function requestReturnAction(input: unknown): Promise<ReturnFormResult> {
  const user = await requireUser();
  const parsed = returnRequestSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  try {
    await requestReturn(user.id, parsed.data.orderId, parsed.data);
  } catch (error) {
    if (error instanceof ReturnError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath(`/account/orders/${parsed.data.orderId}`);
  return { ok: true };
}

export async function uploadReturnPhotoAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!rateLimit(`return-photo:${user.id}`, 10, 60 * 60 * 1000).ok)
    return { ok: false, error: "Too many uploads. Try again later." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a photo." };
  try {
    return { ok: true, url: await uploadImage(file, "jewellery-store/returns") };
  } catch (error) {
    return { ok: false, error: error instanceof UploadError ? error.message : "Upload failed." };
  }
}
