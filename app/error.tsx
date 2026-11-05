"use client";

import { useEffect } from "react";
import { RecoveryLinks } from "@/components/layout/recovery-links";
import { Button } from "@/components/ui/button";

/** Shown when a page crashes. The error is sent to Sentry; details are never shown to customers. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Loaded on demand so Sentry never affects normal pages.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error)).catch(() => {});
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-muted-foreground text-sm tracking-widest uppercase">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl">Sorry — this page didn&apos;t load</h1>
      <p className="text-muted-foreground mt-3">
        Please try again. If it keeps happening, contact us
        {error.digest ? (
          <>
            {" "}
            and mention the code <code className="text-foreground">{error.digest}</code>
          </>
        ) : null}
        . Your cart and account are safe.
      </p>
      <Button onClick={reset} className="mt-6">
        Try again
      </Button>
      <RecoveryLinks />
    </div>
  );
}
