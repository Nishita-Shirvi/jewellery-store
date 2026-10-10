"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser } from "@/lib/auth-guards";
import { productIdSchema } from "@/lib/validation/cart";
import { moveToCart, removeFromWishlist, toggleWishlist } from "@/services/wishlist.service";

export type WishlistToggle =
  { ok: true; wishlisted: boolean } | { ok: false; loginRequired?: boolean; error: string };

export async function toggleWishlistAction(productId: string): Promise<WishlistToggle> {
  const user = await getCurrentUser();
  if (!user)
    return { ok: false, loginRequired: true, error: "Log in to save pieces to your wishlist." };
  const parsed = productIdSchema.safeParse(productId);
  if (!parsed.success) return { ok: false, error: "Something went wrong." };
  try {
    const wishlisted = await toggleWishlist(user.id, parsed.data);
    revalidatePath("/account/wishlist");
    return { ok: true, wishlisted };
  } catch {
    return { ok: false, error: "Couldn't update your wishlist." };
  }
}

export async function removeWishlistAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = productIdSchema.safeParse(formData.get("productId"));
  if (parsed.success) await removeFromWishlist(user.id, parsed.data);
  revalidatePath("/account/wishlist");
}

export async function moveToCartAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = productIdSchema.safeParse(formData.get("productId"));
  if (parsed.success) await moveToCart(user.id, parsed.data);
  revalidatePath("/", "layout");
}
