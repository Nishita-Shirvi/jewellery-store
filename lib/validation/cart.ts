import { z } from "zod";

/** Most of one piece a customer can buy at once (jewellery is rarely bought in bulk). */
export const MAX_QTY_PER_ITEM = 10;
/** Most different pieces a cart can hold. */
export const MAX_CART_LINES = 50;

export const productIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+$/i);

export const cartLineSchema = z.object({
  productId: productIdSchema,
  quantity: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const addToCartSchema = z.object({
  productId: productIdSchema,
  quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const updateQuantitySchema = z.object({
  productId: productIdSchema,
  // 0 removes the item.
  quantity: z.coerce.number().int().min(0).max(MAX_QTY_PER_ITEM),
});

export const removeItemSchema = z.object({ productId: productIdSchema });

export type CartLine = z.infer<typeof cartLineSchema>;
