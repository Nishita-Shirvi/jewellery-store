import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/layout/search-form";
import { UserMenu } from "@/components/layout/user-menu";
import { getCurrentUser } from "@/lib/auth-guards";
import { getCartView } from "@/services/cart.service";
import { publicEnv } from "@/lib/env";

/**
 * Placeholder header (final design comes later — see Docs/note.md).
 */
export async function SiteHeader() {
  const user = await getCurrentUser();
  const cartCount = (await getCartView(user?.id ?? null)).itemCount;

  return (
    <header className="border-border bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight">
          {publicEnv.NEXT_PUBLIC_SITE_NAME}
        </Link>

        <SearchForm className="hidden flex-1 md:block md:max-w-md" />

        <nav aria-label="Account and cart" className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="relative">
            <Link
              href="/cart"
              aria-label={`Cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
            >
              <ShoppingBag />
              {cartCount > 0 && (
                <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium">
                  {cartCount}
                </span>
              )}
            </Link>
          </Button>
          <UserMenu user={user} />
        </nav>
      </div>

      {/* On small screens the search box gets its own row */}
      <div className="mx-auto max-w-6xl px-4 pb-3 md:hidden">
        <SearchForm />
      </div>
    </header>
  );
}
