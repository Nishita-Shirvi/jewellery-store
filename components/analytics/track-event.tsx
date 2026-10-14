"use client";

import { useEffect } from "react";
import { track } from "./analytics";

/** Fires one analytics event when the page is shown (only if the shopper consented). */
export function TrackEvent({ name, params }: { name: string; params: Record<string, unknown> }) {
  useEffect(() => {
    track(name, params);
    // Anonymous store-side counter for the admin funnel report (no cookies, no personal data).
    if (name === "view_item") {
      const body = JSON.stringify({ event: "view_item" });
      if (!navigator.sendBeacon?.("/api/funnel", new Blob([body], { type: "application/json" }))) {
        fetch("/api/funnel", {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return null;
}
