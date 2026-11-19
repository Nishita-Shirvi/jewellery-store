/**
 * Pure cart maths (no database, no cookies) so it can be unit-tested.
 * Prices ALWAYS come from the database rows passed in — never from the browser.
 * Since Phase 17 every line is one VARIANT (size/colour) of a product.
 */
import { MAX_QTY_PER_ITEM } from "@/lib/validation/cart";
import type { CartItemView, CartView } from "@/types/cart";

/** A cart line once its variant is known. */
export interface ResolvedLine {
  variantId: string;
  quantity: number;
}

export interface PricedVariant {
  variantId: string;
  productId: string;
  sku: string;
  variantLabel: string;
  slug: string;
  name: string;
  image: string;
  priceInPaise: number;
  /** Units customers can buy right now (stock − held). */
  stock: number;
  /** Product, its category and this variant are all active. */
  isAvailable: boolean;
  materialSummary: string;
}

/** Most a customer may hold of one variant right now. */
export function maxAllowed(stock: number): number {
  return Math.max(0, Math.min(stock, MAX_QTY_PER_ITEM));
}

/** Combines duplicate lines (e.g. guest cart + saved cart) by adding quantities. */
export function mergeLines(...lists: ResolvedLine[][]): ResolvedLine[] {
  const totals = new Map<string, number>();
  for (const list of lists) {
    for (const line of list) {
      totals.set(line.variantId, (totals.get(line.variantId) ?? 0) + line.quantity);
    }
  }
  return [...totals].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Builds what the customer sees. Lines for missing/unavailable variants are flagged and
 * excluded from the subtotal; quantities above stock are reduced to what's available.
 */
export function priceCart(lines: ResolvedLine[], variants: Map<string, PricedVariant>): CartView {
  const items: CartItemView[] = [];

  for (const line of lines) {
    const v = variants.get(line.variantId);
    if (!v) continue; // deleted variant/product: silently dropped

    const limit = v.isAvailable ? maxAllowed(v.stock) : 0;
    let quantity = line.quantity;
    let issue: CartItemView["issue"] = null;

    if (!v.isAvailable) {
      issue = "unavailable";
      quantity = 0;
    } else if (limit === 0) {
      issue = "out_of_stock";
      quantity = 0;
    } else if (quantity > limit) {
      issue = "reduced";
      quantity = limit;
    }

    items.push({
      productId: v.productId,
      variantId: v.variantId,
      sku: v.sku,
      variantLabel: v.variantLabel,
      slug: v.slug,
      name: v.name,
      image: v.image,
      materialSummary: v.materialSummary,
      unitPriceInPaise: v.priceInPaise,
      quantity,
      requestedQuantity: line.quantity,
      maxQuantity: limit,
      lineTotalInPaise: v.priceInPaise * quantity,
      issue,
    });
  }

  const buyable = items.filter((item) => item.quantity > 0);
  return {
    items,
    itemCount: buyable.reduce((sum, item) => sum + item.quantity, 0),
    subtotalInPaise: buyable.reduce((sum, item) => sum + item.lineTotalInPaise, 0),
    hasIssues: items.some((item) => item.issue !== null),
  };
}
