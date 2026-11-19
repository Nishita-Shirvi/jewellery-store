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

/**
 * One cart line. `variantId` is the exact size/colour (Phase 17). Guest-cart cookies written before
 * Phase 17 have no variantId: those lines resolve to the product's base variant when read.
 */
export const cartLineSchema = z.object({
  productId: productIdSchema,
  variantId: productIdSchema.optional(),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const addToCartSchema = z.object({
  productId: productIdSchema,
  /** Required when the product has options; optional for products with a single base variant. */
  variantId: productIdSchema.optional(),
  quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_ITEM),
});

export const updateQuantitySchema = z.object({
  variantId: productIdSchema,
  // 0 removes the item.
  quantity: z.coerce.number().int().min(0).max(MAX_QTY_PER_ITEM),
});

export const removeItemSchema = z.object({ variantId: productIdSchema });

export type CartLine = z.infer<typeof cartLineSchema>;
