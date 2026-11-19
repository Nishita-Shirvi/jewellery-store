"use client";

import { useEffect } from "react";

/** Registers the offline-page service worker (production only; see public/sw.js). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* offline page is a nice-to-have; never break the site */
    });
  }, []);
  return null;
}
