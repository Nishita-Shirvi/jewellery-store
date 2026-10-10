import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Placeholder search box. Submits ?q=... to /products, which is built in Phase 4
 * (until then the link shows the 404 page).
 */
export function SearchForm({ className }: { className?: string }) {
  return (
    <form action="/products" method="get" role="search" className={cn("relative", className)}>
      <label htmlFor="site-search" className="sr-only">
        Search jewellery
      </label>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        id="site-search"
        name="q"
        type="search"
        placeholder="Search rings, earrings, bangles…"
        className="pl-9"
        maxLength={100}
      />
    </form>
  );
}
