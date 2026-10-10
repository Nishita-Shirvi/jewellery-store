import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/catalog/product-image";
import { Button } from "@/components/ui/button";
import { requireUserPage } from "@/lib/auth-guards";
import { formatINR } from "@/lib/format";
import { listWishlist } from "@/services/wishlist.service";
import { moveToCartAction, removeWishlistAction } from "./actions";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default async function WishlistPage() {
  const user = await requireUserPage("/account/wishlist");
  const items = await listWishlist(user.id);

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Wishlist</h1>
      {items.length === 0 ? (
        <div className="border-border mt-8 rounded-md border border-dashed p-10 text-center">
          <p className="font-medium">Nothing saved yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Tap “Save” on any piece to keep it here.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/products">Browse jewellery</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {items.map((item) => (
            <li key={item.productId} className="space-y-2">
              <Link href={`/products/${item.slug}`} className="block">
                <div className="border-border bg-muted overflow-hidden rounded-md border">
                  <ProductImage src={item.image} alt={item.name} />
                </div>
                <p className="mt-2 text-sm font-medium">{item.name}</p>
              </Link>
              <p className="text-muted-foreground text-xs">{item.materialSummary}</p>
              <p className="text-sm font-semibold">{formatINR(item.priceInPaise)}</p>
              {!item.available ? (
                <p className="text-xs text-amber-700">No longer available</p>
              ) : !item.inStock ? (
                <p className="text-xs text-amber-700">Out of stock</p>
              ) : (
                <form action={moveToCartAction}>
                  <input type="hidden" name="productId" value={item.productId} />
                  <Button type="submit" size="sm" className="w-full">
                    Move to cart
                  </Button>
                </form>
              )}
              <form action={removeWishlistAction}>
                <input type="hidden" name="productId" value={item.productId} />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="w-full"
                  aria-label={`Remove ${item.name} from wishlist`}
                >
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
