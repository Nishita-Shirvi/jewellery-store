import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ProductNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Product not found</h1>
      <p className="text-muted-foreground mt-2">
        This piece may have sold out or been removed from the store.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/products">Browse all jewellery</Link>
      </Button>
    </div>
  );
}
