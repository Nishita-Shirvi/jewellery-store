"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Suggestion {
  name: string;
  slug: string;
  image: string;
  priceInPaise: number;
}

/**
 * Search box with suggestions while typing (accessible combobox). Pressing Enter without
 * choosing a suggestion searches all jewellery at /products?q=...
 */
export function SearchForm({ className }: { className?: string }) {
  const router = useRouter();
  const listId = useId();
  const inputId = useId();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastRequest = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const id = ++lastRequest.current;
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q.trim())}`);
        const json = (await res.json()) as { suggestions: Suggestion[] };
        if (id === lastRequest.current) {
          setItems(json.suggestions);
          setOpen(true);
          setActive(-1);
        }
      } catch {
        /* suggestions are optional */
      }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [q]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      setOpen(false);
      router.push(`/products/${items[active]!.slug}`);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form
      action="/products"
      method="get"
      role="search"
      className={cn("relative", className)}
      onSubmit={() => setOpen(false)}
    >
      <label htmlFor={inputId} className="sr-only">
        Search jewellery
      </label>
      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        id={inputId}
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Search rings, earrings, bangles…"
        className="pl-9"
        maxLength={100}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => items.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        data-search-input
      />
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="border-border bg-background absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border shadow-lg"
        >
          {items.map((s, i) => (
            <li key={s.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <a
                href={`/products/${s.slug}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm",
                  i === active ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <Image
                  src={s.image}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized={s.image.endsWith(".svg")}
                  className="border-border rounded border"
                />
                <span className="flex-1">{s.name}</span>
                <span className="text-muted-foreground">{formatINR(s.priceInPaise)}</span>
              </a>
            </li>
          ))}
          <li role="presentation" className="border-border border-t">
            <button
              type="submit"
              className="hover:bg-accent w-full px-3 py-2 text-left text-sm underline-offset-4 hover:underline"
            >
              See all results for “{q.trim()}”
            </button>
          </li>
        </ul>
      )}
    </form>
  );
}
