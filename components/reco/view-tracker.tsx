"use client";

import { useEffect } from "react";
import { isWidget, pushRecent, RECENT_COOKIE } from "@/lib/reco";

/**
 * On a product page (Phase 25):
 *  - remembers it in the shopper's own "recently viewed" cookie (product addresses only);
 *  - if they arrived from a recommendation (?rw=similar…), reports the click once and removes
 *    the marker from the address bar so shared links and refreshes don't count again.
 */
export function ViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const current = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${RECENT_COOKIE}=`))
        ?.slice(RECENT_COOKIE.length + 1);
      const next = pushRecent(current, slug);
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${RECENT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=${60 * 60 * 24 * 60}; SameSite=Lax${secure}`;
    } catch {
      /* cookies blocked: no recently-viewed row, nothing else changes */
    }

    const url = new URL(location.href);
    const widget = url.searchParams.get("rw");
    if (!widget) return;
    url.searchParams.delete("rw");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    if (!isWidget(widget)) return;
    void fetch("/api/reco/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widget, event: "click", slug }),
      keepalive: true,
    }).catch(() => undefined);
  }, [slug]);
  return null;
}
