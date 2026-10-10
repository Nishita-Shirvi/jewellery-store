import "server-only";
import { db } from "@/lib/db";
import { materialSummary } from "@/lib/jewellery";
import { availableStock } from "@/services/inventory.service";
import { addItem } from "@/services/cart.service";
import type { CartActionResult } from "@/types/cart";

const MAX_WISHLIST = 200;

export async function isWishlisted(userId: string, productId: string) {
  return Boolean(
    await db.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    }),
  );
}

/** Adds or removes. Returns the new state. */
export async function toggleWishlist(userId: string, productId: string): Promise<boolean> {
  const existing = await db.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true },
  });
  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return false;
  }
  const product = await db.product.findFirst({
    where: { id: productId, isActive: true },
    select: { id: true },
  });
  if (!product) throw new Error("Product not available");
  if ((await db.wishlistItem.count({ where: { userId } })) >= MAX_WISHLIST)
    throw new Error("Wishlist is full");
  await db.wishlistItem.upsert({
    where: { userId_productId: { userId, productId } },
    update: {},
    create: { userId, productId },
  });
  return true;
}

export async function removeFromWishlist(userId: string, productId: string) {
  await db.wishlistItem.deleteMany({ where: { userId, productId } });
}

export async function listWishlist(userId: string) {
  const items = await db.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { product: { include: { category: { select: { isActive: true } } } } },
  });
  return items.map(({ product: p }) => ({
    productId: p.id,
    slug: p.slug,
    name: p.name,
    image: p.images[0] ?? "/images/products/classic-solitaire-ring.svg",
    priceInPaise: p.priceInPaise,
    materialSummary: materialSummary(p),
    available: p.isActive && p.category.isActive,
    inStock: availableStock(p) > 0,
  }));
}

/** Adds one to the cart, and removes it from the wishlist only if that worked. */
export async function moveToCart(userId: string, productId: string): Promise<CartActionResult> {
  const result = await addItem(userId, productId, 1);
  if (result.ok) await removeFromWishlist(userId, productId);
  return result;
}
