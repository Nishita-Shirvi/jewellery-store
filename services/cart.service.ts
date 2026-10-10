import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { availableStock } from "@/services/inventory.service";
import { env } from "@/lib/env";
import { materialSummary } from "@/lib/jewellery";
import { MAX_CART_LINES, cartLineSchema, type CartLine } from "@/lib/validation/cart";
import { maxAllowed, mergeLines, priceCart, type PricedProduct } from "@/services/pricing";
import type { CartActionResult, CartView } from "@/types/cart";

/**
 * Cart storage:
 *  - Guests: a cookie holding only product IDs and quantities (no prices).
 *  - Signed-in users: Cart/CartItem rows in the database.
 * Prices and stock are ALWAYS re-read from the database.
 *
 * Functions that change the cart must be called from server actions or route handlers
 * (cookies can only be written there).
 */

export const GUEST_CART_COOKIE = "guest_cart";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const FALLBACK_IMAGE = "/images/products/classic-solitaire-ring.svg";

const guestCookieSchema = z.array(cartLineSchema).max(MAX_CART_LINES);

// ───────────────────────── storage ─────────────────────────

async function readGuestLines(): Promise<CartLine[]> {
  const raw = (await cookies()).get(GUEST_CART_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = guestCookieSchema.safeParse(JSON.parse(raw));
    return parsed.success ? mergeLines(parsed.data) : [];
  } catch {
    return []; // tampered or corrupt cookie: start fresh
  }
}

async function writeGuestLines(lines: CartLine[]): Promise<void> {
  const jar = await cookies();
  if (lines.length === 0) {
    jar.delete(GUEST_CART_COOKIE);
    return;
  }
  jar.set(GUEST_CART_COOKIE, JSON.stringify(lines.slice(0, MAX_CART_LINES)), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

async function readUserLines(userId: string): Promise<CartLine[]> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: {
      items: { select: { productId: true, quantity: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return cart?.items ?? [];
}

async function readLines(userId: string | null): Promise<CartLine[]> {
  return userId ? readUserLines(userId) : readGuestLines();
}

/** Sets one product's quantity (0 deletes it). */
async function writeLine(userId: string | null, productId: string, quantity: number) {
  if (!userId) {
    const lines = (await readGuestLines()).filter((l) => l.productId !== productId);
    if (quantity > 0) lines.push({ productId, quantity });
    await writeGuestLines(lines);
    return;
  }

  if (quantity <= 0) {
    await db.cartItem.deleteMany({ where: { cart: { userId }, productId } });
    return;
  }
  const cart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  await db.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { quantity },
    create: { cartId: cart.id, productId, quantity },
  });
}

// ───────────────────────── products ─────────────────────────

async function loadProducts(productIds: string[]): Promise<Map<string, PricedProduct>> {
  if (productIds.length === 0) return new Map();
  const rows = await db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      slug: true,
      name: true,
      images: true,
      priceInPaise: true,
      stock: true,
      reservedStock: true,
      isActive: true,
      metalType: true,
      purity: true,
      metalColour: true,
      netWeightMg: true,
      category: { select: { isActive: true } },
    },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        image: row.images[0] ?? FALLBACK_IMAGE,
        priceInPaise: row.priceInPaise,
        stock: availableStock(row),
        isAvailable: row.isActive && row.category.isActive,
        materialSummary: materialSummary(row),
      },
    ]),
  );
}

async function loadProduct(productId: string): Promise<PricedProduct | null> {
  return (await loadProducts([productId])).get(productId) ?? null;
}

// ───────────────────────── reads ─────────────────────────

export async function getCartView(userId: string | null): Promise<CartView> {
  const lines = await readLines(userId);
  return priceCart(lines, await loadProducts(lines.map((l) => l.productId)));
}

// ───────────────────────── changes ─────────────────────────

export async function addItem(
  userId: string | null,
  productId: string,
  quantity: number,
): Promise<CartActionResult> {
  const product = await loadProduct(productId);
  if (!product || !product.isAvailable) {
    return { ok: false, error: "This piece is no longer available." };
  }

  const lines = await readLines(userId);
  const existing = lines.find((l) => l.productId === productId)?.quantity ?? 0;
  if (existing === 0 && lines.length >= MAX_CART_LINES) {
    return { ok: false, error: "Your cart is full. Remove something to add this piece." };
  }

  const limit = maxAllowed(product.stock);
  if (limit === 0) return { ok: false, error: "Sorry, this piece is out of stock." };
  if (existing >= limit) {
    return { ok: false, error: `You already have the maximum available (${limit}) in your cart.` };
  }
  if (existing + quantity > limit) {
    const canAdd = limit - existing;
    return {
      ok: false,
      error: `Only ${limit} available. You can add ${canAdd} more.`,
    };
  }

  await writeLine(userId, productId, existing + quantity);
  return { ok: true, message: "Added to cart." };
}

export async function setItemQuantity(
  userId: string | null,
  productId: string,
  quantity: number,
): Promise<CartActionResult> {
  if (quantity === 0) return removeItem(userId, productId);

  const product = await loadProduct(productId);
  if (!product || !product.isAvailable) {
    return { ok: false, error: "This piece is no longer available. Please remove it." };
  }
  const limit = maxAllowed(product.stock);
  if (quantity > limit) {
    return {
      ok: false,
      error: limit === 0 ? "Sorry, this piece is out of stock." : `Only ${limit} available.`,
    };
  }

  await writeLine(userId, productId, quantity);
  return { ok: true };
}

export async function removeItem(
  userId: string | null,
  productId: string,
): Promise<CartActionResult> {
  await writeLine(userId, productId, 0);
  return { ok: true, message: "Removed from cart." };
}

export async function clearCart(userId: string | null): Promise<CartActionResult> {
  if (userId) await db.cartItem.deleteMany({ where: { cart: { userId } } });
  else await writeGuestLines([]);
  return { ok: true };
}

/**
 * Called right after login: moves the guest cookie cart into the user's saved cart.
 * Quantities are added together and capped by stock; unavailable items are dropped.
 */
export async function mergeGuestCartIntoUser(userId: string): Promise<void> {
  const guestLines = await readGuestLines();
  if (guestLines.length === 0) return;

  const merged = mergeLines(await readUserLines(userId), guestLines);
  const products = await loadProducts(merged.map((l) => l.productId));

  for (const line of merged) {
    const product = products.get(line.productId);
    if (!product?.isAvailable) continue;
    const quantity = Math.min(line.quantity, maxAllowed(product.stock));
    if (quantity > 0) await writeLine(userId, line.productId, quantity);
  }
  await writeGuestLines([]);
}
