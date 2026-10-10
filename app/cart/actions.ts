"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-guards";
import { addToCartSchema, removeItemSchema, updateQuantitySchema } from "@/lib/validation/cart";
import { addItem, clearCart, removeItem, setItemQuantity } from "@/services/cart.service";
import type { CartActionResult } from "@/types/cart";

const INVALID: CartActionResult = { ok: false, error: "Something was wrong with that request." };

function refresh() {
  // Header badge + cart page.
  revalidatePath("/", "layout");
}

export async function addToCartAction(input: {
  productId: string;
  quantity: number;
}): Promise<CartActionResult> {
  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const user = await getCurrentUser();
  const result = await addItem(user?.id ?? null, parsed.data.productId, parsed.data.quantity);
  if (result.ok) refresh();
  return result;
}

export async function updateQuantityAction(input: {
  productId: string;
  quantity: number;
}): Promise<CartActionResult> {
  const parsed = updateQuantitySchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const user = await getCurrentUser();
  const result = await setItemQuantity(
    user?.id ?? null,
    parsed.data.productId,
    parsed.data.quantity,
  );
  refresh();
  return result;
}

export async function removeItemAction(input: { productId: string }): Promise<CartActionResult> {
  const parsed = removeItemSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const user = await getCurrentUser();
  const result = await removeItem(user?.id ?? null, parsed.data.productId);
  refresh();
  return result;
}

export async function clearCartAction(): Promise<CartActionResult> {
  const user = await getCurrentUser();
  const result = await clearCart(user?.id ?? null);
  refresh();
  return result;
}
