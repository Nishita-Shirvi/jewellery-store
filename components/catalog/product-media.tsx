"use client";

import { useState } from "react";
import { Rotate3d } from "lucide-react";
import { ProductImage } from "@/components/catalog/product-image";
import { cn } from "@/lib/utils";

/**
 * Product photos plus an optional 360° turntable video. Thumbnails switch the main view;
 * the video loads only when chosen (preload="none"), so it never slows the page down.
 */
export function ProductMedia({
  name,
  images,
  spinVideoUrl,
}: {
  name: string;
  images: string[];
  spinVideoUrl: string | null;
}) {
  const [active, setActive] = useState<number | "video">(0);
  const thumbs = images.length > 1 || spinVideoUrl;

  return (
    <div className="space-y-3">
      <div className="border-border bg-muted overflow-hidden rounded-md border">
        {active === "video" && spinVideoUrl ? (
          <video
            src={spinVideoUrl}
            className="aspect-square w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            controls
            preload="none"
            aria-label={`${name}, 360° view`}
          />
        ) : (
          <ProductImage
            src={images[active === "video" ? 0 : active] ?? images[0]!}
            alt={active === 0 ? name : `${name}, view ${Number(active) + 1}`}
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
          />
        )}
      </div>
      {thumbs && (
        <ul className="grid grid-cols-5 gap-2" aria-label="More views">
          {images.map((src, i) => (
            <li key={`${src}-${i}`}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show view ${i + 1}`}
                aria-pressed={active === i}
                className={cn(
                  "border-border bg-muted block w-full overflow-hidden rounded border",
                  active === i && "ring-primary ring-2",
                )}
              >
                <ProductImage src={src} alt="" sizes="10vw" />
              </button>
            </li>
          ))}
          {spinVideoUrl && (
            <li>
              <button
                type="button"
                onClick={() => setActive("video")}
                aria-pressed={active === "video"}
                className={cn(
                  "border-border bg-muted text-muted-foreground flex aspect-square w-full flex-col items-center justify-center gap-1 rounded border text-[11px]",
                  active === "video" && "ring-primary text-foreground ring-2",
                )}
              >
                <Rotate3d className="size-5" aria-hidden="true" />
                360° view
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
