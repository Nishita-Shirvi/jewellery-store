import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";
import { SearchForm } from "@/components/layout/search-form";
import { UserMenu } from "@/components/layout/user-menu";
import { RateStrip } from "@/components/layout/rate-strip";
import { Wordmark } from "@/components/layout/wordmark";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { getCurrentUser } from "@/lib/auth-guards";
import { getCategories } from "@/services/catalog.service";
import { getCartView } from "@/services/cart.service";

const iconLink =
  "hover:bg-on/10 focus-visible:ring-gilt relative grid size-9 place-items-center rounded-full outline-none focus-visible:ring-2";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const [cart, categories] = await Promise.all([getCartView(user?.id ?? null), getCategories()]);
  const cartCount = cart.itemCount;

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-brand text-on border-gilt/45 border-b">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6 md:py-4">
          <Wordmark href="/" className="shrink-0" />

          <SearchForm className="ml-auto hidden w-64 md:block" />

          <nav aria-label="Account and cart" className="ml-auto flex items-center gap-1 md:ml-0">
            <ModeToggle className="mr-1" />
            <Link href="/account/wishlist" aria-label="Wishlist" className={iconLink}>
              <Heart className="size-5" />
            </Link>
            <Link
              href="/cart"
              aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
              className={iconLink}
            >
              <ShoppingBag className="size-5" />
              {cartCount > 0 && (
                <span className="bg-gilt absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-semibold text-[#1a1012]">
                  {cartCount}
                </span>
              )}
            </Link>
            <UserMenu user={user} />
          </nav>
        </div>

        {/* Small screens: search gets its own row. Categories always have their own row. */}
        <div className="mx-auto max-w-7xl px-4 pb-3 md:hidden">
          <SearchForm />
        </div>
        <nav
          aria-label="Categories"
          className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 pb-3 text-sm tracking-wide whitespace-nowrap md:justify-center-safe md:pb-3.5 md:text-[13.5px]"
        >
          <Link
            href="/products"
            className="hover:border-gilt/70 shrink-0 border-b border-transparent py-0.5"
          >
            All jewellery
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="hover:border-gilt/70 shrink-0 border-b border-transparent py-0.5"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </div>
      <RateStrip />
    </header>
  );
}
