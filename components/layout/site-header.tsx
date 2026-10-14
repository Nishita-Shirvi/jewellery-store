import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";
import { SearchForm } from "@/components/layout/search-form";
import { UserMenu } from "@/components/layout/user-menu";
import { getCurrentUser } from "@/lib/auth-guards";
import { publicEnv } from "@/lib/env";
import { getCategories } from "@/services/catalog.service";
import { getCartView } from "@/services/cart.service";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const [cart, categories] = await Promise.all([getCartView(user?.id ?? null), getCategories()]);
  const cartCount = cart.itemCount;

  return (
    <header className="bg-background/95 sticky top-0 z-40 backdrop-blur">
      <p className="bg-primary text-primary-foreground px-4 py-1.5 text-center text-xs">
        Free insured shipping on orders above ₹999. Every gold piece is BIS hallmarked.
      </p>
      <div className="border-border border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-4">
          <Link
            href="/"
            className="font-display text-primary shrink-0 text-2xl tracking-wide"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {publicEnv.NEXT_PUBLIC_SITE_NAME}
          </Link>

          <nav aria-label="Categories" className="hidden items-center gap-5 text-sm lg:flex">
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="hover:text-primary underline-offset-8 hover:underline"
              >
                {c.name}
              </Link>
            ))}
          </nav>

          <SearchForm className="ml-auto hidden w-64 md:block" />

          <nav aria-label="Account and cart" className="ml-auto flex items-center gap-1 md:ml-0">
            <Link
              href="/account/wishlist"
              aria-label="Wishlist"
              className="hover:bg-accent rounded-md p-2"
            >
              <Heart className="size-5" />
            </Link>
            <Link
              href="/cart"
              aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
              className="hover:bg-accent relative rounded-md p-2"
            >
              <ShoppingBag className="size-5" />
              {cartCount > 0 && (
                <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
                  {cartCount}
                </span>
              )}
            </Link>
            <UserMenu user={user} />
          </nav>
        </div>

        {/* Small screens: search and categories get their own rows. */}
        <div className="mx-auto max-w-6xl space-y-3 px-4 pb-3 md:hidden">
          <SearchForm />
        </div>
        <nav
          aria-label="Categories"
          className="mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 pb-3 text-sm lg:hidden"
        >
          {categories.map((c) => (
            <Link key={c.slug} href={`/collections/${c.slug}`} className="shrink-0 hover:underline">
              {c.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
