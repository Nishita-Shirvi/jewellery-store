import type { Metadata } from "next";
import { RecoveryLinks } from "@/components/layout/recovery-links";
import { getCurrentUser } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

/** 404: a page or product that doesn't exist (any more). */
export default async function NotFound() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-muted-foreground text-sm tracking-widest uppercase">Error 404</p>
      <h1 className="mt-2 text-3xl">Page not found</h1>
      <p className="text-muted-foreground mt-3">
        This page doesn&apos;t exist, or the piece is no longer available. Try the links below or
        search for it in the header.
      </p>
      <RecoveryLinks signedIn={Boolean(user)} />
    </div>
  );
}
