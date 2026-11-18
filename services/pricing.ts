/**
 * Pure cart maths (no database, no cookies) so it can be unit-tested.
 * Prices ALWAYS come from the database rows passed in — never from the browser.
 */
import { MAX_QTY_PER_ITEM, lineKey, type CartLine } from "@/lib/validation/cart";
import type { CartItemView, CartView } from "@/types/cart";

export interface PricedProduct {
  id: string;
  slug: string;
  name: string;
  image: string;
  priceInPaise: number;
  stock: number;
  isAvailable: boolean; // product and its category are active
  materialSummary: string;
  /** Sizes the customer must choose from; empty = no size. */
  sizes: string[];
}

/** Most a customer may hold of one product right now. */
export function maxAllowed(stock: number): number {
  return Math.max(0, Math.min(stock, MAX_QTY_PER_ITEM));
}

/** Combines duplicate lines (same product and size, e.g. guest cart + saved cart) by adding quantities. */
export function mergeLines(...lists: CartLine[][]): CartLine[] {
  const totals = new Map<string, CartLine>();
  for (const list of lists) {
    for (const line of list) {
      const key = lineKey(line);
      const existing = totals.get(key);
      totals.set(key, { ...line, quantity: (existing?.quantity ?? 0) + line.quantity });
    }
  }
  return [...totals.values()];
}

/** True when `size` is a valid choice for the product ("" for products without sizes). */
export function isValidSize(product: Pick<PricedProduct, "sizes">, size: string): boolean {
  return product.sizes.length === 0 ? size === "" : product.sizes.includes(size);
}

/**
 * Builds what the customer sees. Lines for missing/unavailable products are flagged and
 * excluded from the subtotal; quantities above stock are reduced to what's available.
 */
export function priceCart(lines: CartLine[], products: Map<string, PricedProduct>): CartView {
  const items: CartItemView[] = [];
  // Sizes of one piece share its stock: earlier lines use it up first.
  const used = new Map<string, number>();

  for (const line of lines) {
    const product = products.get(line.productId);
    if (!product) continue; // deleted product: silently dropped

    const already = used.get(product.id) ?? 0;
    const limit = product.isAvailable ? Math.max(0, maxAllowed(product.stock) - already) : 0;
    let quantity = line.quantity;
    let issue: CartItemView["issue"] = null;

    if (!product.isAvailable || !isValidSize(product, line.size)) {
      // Unknown size (e.g. the admin removed it): the customer must pick again.
      issue = "unavailable";
      quantity = 0;
    } else if (limit === 0) {
      issue = "out_of_stock";
      quantity = 0;
    } else if (quantity > limit) {
      issue = "reduced";
      quantity = limit;
    }

    used.set(product.id, already + quantity);
    items.push({
      productId: product.id,
      size: line.size,
      slug: product.slug,
      name: product.name,
      image: product.image,
      materialSummary: product.materialSummary,
      unitPriceInPaise: product.priceInPaise,
      quantity,
      requestedQuantity: line.quantity,
      maxQuantity: limit,
      lineTotalInPaise: product.priceInPaise * quantity,
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
