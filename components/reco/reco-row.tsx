"use client";

import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { parseRecent, RECENT_COOKIE, WIDGET_LABELS, type Widget } from "@/lib/reco";
import type { ProductCardData } from "@/types/catalog";

/**
 * One recommendation row (Phase 25). Loaded in the browser after the page — only when the
 * shopper scrolls near it — from /api/reco (cached by the CDN), so pages render exactly as fast
 * as without recommendations. An impression is reported once, when the row is actually seen.
 * Nothing is shown if there's nothing to recommend or anything fails.
 */
export function RecoRow({
  widget,
  query,
  title,
  subtitle,
  columns = 4,
}: {
  widget: Widget;
  /** Query string for /api/reco, e.g. "w=similar&id=…". Empty = render nothing. */
  query: string;
  title?: string;
  subtitle?: string;
  columns?: 4 | 6;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  const [items, setItems] = useState<ProductCardData[]>([]);

  // Fetch when the row is about to come into view.
  useEffect(() => {
    if (!query || !sentinel.current) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/reco?${query}`)
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then((d: { items?: ProductCardData[] }) => {
          if (!cancelled) setItems(Array.isArray(d.items) ? d.items : []);
        })
        .catch(() => undefined);
    if (!("IntersectionObserver" in window)) {
      void load();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(sentinel.current);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [query]);

  // Count an impression once, when at least half of the row is on screen.
  useEffect(() => {
    if (items.length === 0 || !section.current || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void fetch("/api/reco/event", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ widget, event: "impression" }),
            keepalive: true,
          }).catch(() => undefined);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(section.current);
    return () => io.disconnect();
  }, [items, widget]);

  const heading = title ?? WIDGET_LABELS[widget];
  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      {items.length > 0 && (
        <section ref={section} aria-label={heading} data-widget={widget} className="mt-14">
          <h2 className="text-2xl">{heading}</h2>
          {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
          <ul
            className={`mt-6 grid grid-cols-2 gap-x-4 gap-y-8 ${columns === 6 ? "md:grid-cols-3 lg:grid-cols-6" : "md:grid-cols-4"}`}
          >
            {items.map((p) => (
              <li key={p.slug}>
                <ProductCard product={p} trackAs={widget} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** "Recently viewed": the list lives in the shopper's own cookie, read here in the browser. */
export function RecentlyViewedRow({ excludeSlug }: { excludeSlug?: string }) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${RECENT_COOKIE}=`))
      ?.slice(RECENT_COOKIE.length + 1);
    const slugs = parseRecent(raw).filter((s) => s !== excludeSlug);
    if (slugs.length === 0) return;
    const q = new URLSearchParams({ w: "recent", slugs: slugs.join(".") });
    if (excludeSlug) q.set("ex", excludeSlug);
    setQuery(q.toString());
  }, [excludeSlug]);
  return <RecoRow widget="recent" query={query} columns={6} />;
}
