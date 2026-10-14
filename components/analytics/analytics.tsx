"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";

const COOKIE = "consent";

export function readConsent(): "analytics" | "essential" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )consent=(analytics|essential)/);
  return (m?.[1] as "analytics" | "essential" | undefined) ?? null;
}

/** Sends an e-commerce event to GA4 only if the shopper accepted analytics cookies. */
export function track(name: string, params: Record<string, unknown>) {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void };
  if (readConsent() === "analytics" && w.gtag) w.gtag("event", name, params);
}

/** Cookie banner + GA4 (loaded only after "Accept"). */
export function Analytics({ gaId }: { gaId?: string }) {
  const [consent, setConsent] = useState<"analytics" | "essential" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConsent(readConsent());
    setReady(true);
  }, []);

  function choose(value: "analytics" | "essential") {
    document.cookie = `${COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    setConsent(value);
  }

  return (
    <>
      {gaId && consent === "analytics" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${gaId}',{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {ready && consent === null && (
        <div
          role="dialog"
          aria-label="Cookie choices"
          className="border-border bg-background fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-md border p-4 shadow-xl"
        >
          <p className="text-sm">
            We use essential cookies to keep you logged in and remember your cart. With your
            permission we also use analytics cookies to understand which pieces people like.{" "}
            <a href="/privacy" className="underline">
              Privacy policy
            </a>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => choose("analytics")}>
              Accept analytics
            </Button>
            <Button size="sm" variant="outline" onClick={() => choose("essential")}>
              Essential only
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
