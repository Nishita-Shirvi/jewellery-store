"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleWishlistAction } from "@/app/account/wishlist/actions";

export function WishlistButton({
  productId,
  initial,
  slug,
}: {
  productId: string;
  initial: boolean;
  slug: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const res = await toggleWishlistAction(productId);
      if (res.ok) {
        setSaved(res.wishlisted);
        setMessage(res.wishlisted ? "Saved to your wishlist." : "Removed from your wishlist.");
      } else if (res.loginRequired) {
        router.push(`/login?callbackUrl=${encodeURIComponent(`/products/${slug}`)}`);
      } else setMessage(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      >
        <Heart className={saved ? "fill-red-600 text-red-600" : ""} />
        <span>{saved ? "Saved" : "Save"}</span>
      </Button>
      <span role="status" aria-live="polite" className="text-muted-foreground text-xs">
        {message}
      </span>
    </div>
  );
}
