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

/** "" = the product has no sizes. Checked against the product's own size list in the service. */
export const sizeSchema = z
  .string()
  .trim()
  .max(12)
  .regex(/^[0-9A-Za-z.\-/ ]*$/)
  .default("");

export const cartLineSchema = z.object({
  productId: productIdSchema,
  // Cookies written before sizes existed have no size.
  size: sizeSchema,
  quantity: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const addToCartSchema = z.object({
  productId: productIdSchema,
  size: sizeSchema,
  quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const updateQuantitySchema = z.object({
  productId: productIdSchema,
  size: sizeSchema,
  // 0 removes the item.
  quantity: z.coerce.number().int().min(0).max(MAX_QTY_PER_ITEM),
});

export const removeItemSchema = z.object({ productId: productIdSchema, size: sizeSchema });

export type CartLine = z.infer<typeof cartLineSchema>;

/** One cart line per product + size. */
export function lineKey(line: { productId: string; size: string }): string {
  return `${line.productId}|${line.size}`;
}
