import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground mt-2">
        This page doesn&apos;t exist yet, or the link is wrong.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Go to the home page</Link>
      </Button>
    </div>
  );
}
