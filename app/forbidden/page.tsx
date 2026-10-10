import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access denied", robots: { index: false } };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground mt-2">
        You don&apos;t have permission to view this page.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Go to the home page</Link>
      </Button>
    </div>
  );
}
