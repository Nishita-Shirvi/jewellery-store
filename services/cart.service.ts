import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { availableStock } from "@/services/inventory.service";
import { env } from "@/lib/env";
import { materialSummary } from "@/lib/jewellery";
import { variantJewellery } from "@/lib/variants";
import { MAX_CART_LINES, cartLineSchema, type CartLine } from "@/lib/validation/cart";
import {
  maxAllowed,
  mergeLines,
  priceCart,
  type PricedVariant,
  type ResolvedLine,
} from "@/services/pricing";
import type { CartActionResult, CartView } from "@/types/cart";

/**
 * Cart storage:
 *  - Guests: a cookie holding only product/variant IDs and quantities (no prices).
 *  - Signed-in users: Cart/CartItem rows in the database.
 * Prices and stock are ALWAYS re-read from the database.
 *
 * Every line is one VARIANT (Phase 17). Cookies written before Phase 17 carry only a productId:
 * those lines resolve to the product's base variant (optionKey "") when read.
 *
 * Functions that change the cart must be called from server actions or route handlers
 * (cookies can only be written there).
 */

export const GUEST_CART_COOKIE = "guest_cart";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const FALLBACK_IMAGE = "/images/products/classic-solitaire-ring.svg";

const guestCookieSchema = z.array(cartLineSchema).max(MAX_CART_LINES);

// ───────────────────────── variant lookup ─────────────────────────

const variantSelect = {
  id: true,
  productId: true,
  sku: true,
  label: true,
  priceInPaise: true,
  stock: true,
  reservedStock: true,
  isActive: true,
  images: true,
  purity: true,
  metalColour: true,
  netWeightMg: true,
  grossWeightMg: true,
  product: {
    select: {
      slug: true,
      name: true,
      images: true,
      isActive: true,
      metalType: true,
      purity: true,
      metalColour: true,
      category: { select: { isActive: true } },
    },
  },
} as const;

/**
 * Turns raw lines into variant lines. A line's variant must belong to its product (a tampered
 * cookie pointing product A at a variant of product B is dropped). Old lines without a variant
 * resolve to the product's base variant; if the product now has options, they are dropped.
 */
async function resolveLines(lines: CartLine[]): Promise<ResolvedLine[]> {
  const withVariant = lines.filter((l) => l.variantId);
  const productOnly = lines.filter((l) => !l.variantId);
  const [known, bases] = await Promise.all([
    withVariant.length
      ? db.productVariant.findMany({
          where: { id: { in: withVariant.map((l) => l.variantId!) } },
          select: { id: true, productId: true },
        })
      : [],
    productOnly.length
      ? db.productVariant.findMany({
          where: { productId: { in: productOnly.map((l) => l.productId) }, optionKey: "" },
          select: { id: true, productId: true },
        })
      : [],
  ]);
  const owner = new Map(known.map((v) => [v.id, v.productId]));
  const baseOf = new Map(bases.map((v) => [v.productId, v.id]));

  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    if (line.variantId) {
      if (owner.get(line.variantId) === line.productId)
        resolved.push({ variantId: line.variantId, quantity: line.quantity });
    } else {
      const base = baseOf.get(line.productId);
      if (base) resolved.push({ variantId: base, quantity: line.quantity });
    }
  }
  return mergeLines(resolved);
}

async function loadVariants(variantIds: string[]): Promise<Map<string, PricedVariant>> {
  if (variantIds.length === 0) return new Map();
  const rows = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: variantSelect,
  });
  return new Map(
    rows.map((v) => [
      v.id,
      {
        variantId: v.id,
        productId: v.productId,
        sku: v.sku,
        variantLabel: v.label,
        slug: v.product.slug,
        name: v.product.name,
        image: v.images[0] ?? v.product.images[0] ?? FALLBACK_IMAGE,
        priceInPaise: v.priceInPaise,
        stock: availableStock(v),
        isAvailable: v.isActive && v.product.isActive && v.product.category.isActive,
        materialSummary: materialSummary(variantJewellery(v.product, v)),
      },
    ]),
  );
}

async function loadVariant(variantId: string): Promise<PricedVariant | null> {
  return (await loadVariants([variantId])).get(variantId) ?? null;
}

// ───────────────────────── storage ─────────────────────────

async function readGuestLines(): Promise<ResolvedLine[]> {
  const raw = (await cookies()).get(GUEST_CART_COOKIE)?.value;
  if (!raw) return [];
  let parsed;
  try {
    parsed = guestCookieSchema.safeParse(JSON.parse(raw));
  } catch {
    return []; // tampered or corrupt cookie: start fresh
  }
  return parsed.success ? resolveLines(parsed.data) : [];
}

async function writeGuestLines(lines: ResolvedLine[]): Promise<void> {
  const jar = await cookies();
  if (lines.length === 0) {
    jar.delete(GUEST_CART_COOKIE);
    return;
  }
  // productId is stored next to the variant so the line can be checked when it's read back.
  const owners = await db.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    select: { id: true, productId: true },
  });
  const productOf = new Map(owners.map((o) => [o.id, o.productId]));
  const stored: CartLine[] = lines
    .filter((l) => productOf.has(l.variantId))
    .slice(0, MAX_CART_LINES)
    .map((l) => ({
      productId: productOf.get(l.variantId)!,
      variantId: l.variantId,
      quantity: l.quantity,
    }));
  jar.set(GUEST_CART_COOKIE, JSON.stringify(stored), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

async function readUserLines(userId: string): Promise<ResolvedLine[]> {
  const cart = await db.cart.findUnique({
    where: { userId },
    select: {
      items: { select: { variantId: true, quantity: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return cart?.items ?? [];
}

async function readLines(userId: string | null): Promise<ResolvedLine[]> {
  return userId ? readUserLines(userId) : readGuestLines();
}

/** Sets one variant's quantity (0 deletes it). */
async function writeLine(
  userId: string | null,
  line: { productId: string; variantId: string },
  quantity: number,
) {
  if (!userId) {
    const lines = (await readGuestLines()).filter((l) => l.variantId !== line.variantId);
    if (quantity > 0) lines.push({ variantId: line.variantId, quantity });
    await writeGuestLines(lines);
    return;
  }

  if (quantity <= 0) {
    await db.cartItem.deleteMany({ where: { cart: { userId }, variantId: line.variantId } });
    return;
  }
  const cart = await db.cart.upsert({ where: { userId }, update: {}, create: { userId } });
  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId: line.variantId } },
    update: { quantity },
    create: { cartId: cart.id, productId: line.productId, variantId: line.variantId, quantity },
  });
}

// ───────────────────────── reads ─────────────────────────

export async function getCartView(userId: string | null): Promise<CartView> {
  const lines = await readLines(userId);
  return priceCart(lines, await loadVariants(lines.map((l) => l.variantId)));
}

// ───────────────────────── changes ─────────────────────────

/**
 * Which variant an "Add to cart" means. With a variantId it must belong to the product; without
 * one, the product must have exactly one active variant (products without options).
 */
async function chooseVariant(
  productId: string,
  variantId: string | undefined,
): Promise<{ ok: true; variantId: string } | { ok: false; error: string }> {
  if (variantId) {
    const v = await db.productVariant.findUnique({
      where: { id: variantId },
      select: { productId: true },
    });
    if (!v || v.productId !== productId)
      return { ok: false, error: "This option is no longer available." };
    return { ok: true, variantId };
  }
  const active = await db.productVariant.findMany({
    where: { productId, isActive: true },
    select: { id: true },
    take: 2,
  });
  if (active.length === 1) return { ok: true, variantId: active[0]!.id };
  if (active.length === 0) return { ok: false, error: "This piece is no longer available." };
  return { ok: false, error: "Please choose an option first." };
}

export async function addItem(
  userId: string | null,
  productId: string,
  quantity: number,
  requestedVariantId?: string,
): Promise<CartActionResult> {
  const choice = await chooseVariant(productId, requestedVariantId);
  if (!choice.ok) return choice;
  const variant = await loadVariant(choice.variantId);
  if (!variant || !variant.isAvailable) {
    return { ok: false, error: "This piece is no longer available." };
  }

  const lines = await readLines(userId);
  const existing = lines.find((l) => l.variantId === variant.variantId)?.quantity ?? 0;
  if (existing === 0 && lines.length >= MAX_CART_LINES) {
    return { ok: false, error: "Your cart is full. Remove something to add this piece." };
  }

  const limit = maxAllowed(variant.stock);
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

  await writeLine(userId, variant, existing + quantity);
  return { ok: true, message: "Added to cart." };
}

export async function setItemQuantity(
  userId: string | null,
  variantId: string,
  quantity: number,
): Promise<CartActionResult> {
  if (quantity === 0) return removeItem(userId, variantId);

  const lines = await readLines(userId);
  if (!lines.some((l) => l.variantId === variantId))
    return { ok: false, error: "That item isn't in your cart." };
  const variant = await loadVariant(variantId);
  if (!variant || !variant.isAvailable) {
    return { ok: false, error: "This piece is no longer available. Please remove it." };
  }
  const limit = maxAllowed(variant.stock);
  if (quantity > limit) {
    return {
      ok: false,
      error: limit === 0 ? "Sorry, this piece is out of stock." : `Only ${limit} available.`,
    };
  }

  await writeLine(userId, variant, quantity);
  return { ok: true };
}

export async function removeItem(
  userId: string | null,
  variantId: string,
): Promise<CartActionResult> {
  const v = await db.productVariant.findUnique({
    where: { id: variantId },
    select: { productId: true },
  });
  if (v) await writeLine(userId, { productId: v.productId, variantId }, 0);
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
  const variants = await loadVariants(merged.map((l) => l.variantId));

  for (const line of merged) {
    const variant = variants.get(line.variantId);
    if (!variant?.isAvailable) continue;
    const quantity = Math.min(line.quantity, maxAllowed(variant.stock));
    if (quantity > 0) await writeLine(userId, variant, quantity);
  }
  await writeGuestLines([]);
}
