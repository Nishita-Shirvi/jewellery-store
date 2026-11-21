"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ModelLayer, Piece } from "@/components/home/display-model";
import { TILE_BOX, zoomOrigin, type CategoryTile } from "@/lib/tiles";
import { cn } from "@/lib/utils";
import type { CategorySummary } from "@/types/catalog";

/** The tile picture: the piece on its model, and the photo that grows out of it on hover. */
export function TileArt({
  tile,
  image,
  alt,
  uid,
  sizes = "(min-width: 1024px) 16vw, (min-width: 640px) 30vw, 45vw",
  svgProps,
}: {
  tile: CategoryTile | null;
  image: string;
  alt: string;
  uid: string;
  sizes?: string;
  svgProps?: React.SVGProps<SVGSVGElement>;
}) {
  const zoom = tile?.zoom || image;
  return (
    <div
      className={cn("vj-tile", !tile && "plain")}
      style={tile ? (zoomOrigin(tile) as React.CSSProperties) : undefined}
    >
      {tile && (
        <svg
          className="vj-model"
          viewBox={`0 0 ${TILE_BOX.width} ${TILE_BOX.height}`}
          aria-hidden="true"
          {...svgProps}
        >
          <ModelLayer tile={tile} uid={uid} />
          <g className="vj-piece">
            <Piece tile={tile} />
          </g>
        </svg>
      )}
      <Image
        className="vj-zoom"
        src={zoom}
        alt={alt}
        fill
        sizes={sizes}
        unoptimized={zoom.endsWith(".svg")}
      />
    </div>
  );
}

/**
 * "Find your kind of beautiful": each category's piece worn on a display model. Hover (or
 * keyboard focus) brings the full product photo up from where the piece sits. On touch screens
 * the first tap shows the photo and the second opens the category.
 */
export function CategoryTiles({ categories }: { categories: CategorySummary[] }) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  return (
    <ul
      className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:[grid-template-columns:repeat(var(--tiles),minmax(0,1fr))]"
      // One row on wide screens: as many columns as categories (up to 6).
      style={{ "--tiles": Math.min(Math.max(categories.length, 3), 6) } as React.CSSProperties}
    >
      {categories.map((c, i) => (
        <li key={c.slug} className="min-w-0">
          <Link
            href={`/collections/${c.slug}`}
            className={cn("vj-cat group grid gap-3 outline-none", zoomed === c.slug && "is-zoom")}
            onClick={(e) => {
              if (zoomed === c.slug || !window.matchMedia("(pointer: coarse)").matches) return;
              e.preventDefault();
              setZoomed(c.slug);
            }}
          >
            <TileArt tile={c.tile} image={c.image} alt={c.tile?.zoomAlt || c.name} uid={`c${i}`} />
            <span>
              <span
                className="text-head flex items-center gap-1.5 text-lg sm:text-[23px]"
                style={{ fontFamily: "var(--font-display)", fontWeight: 500 }}
              >
                {c.name}
                <ArrowRight className="text-eyebrow size-4 max-sm:hidden" aria-hidden="true" />
              </span>
              <span className="text-muted-foreground block text-xs">
                {c.productCount} {c.productCount === 1 ? "piece" : "pieces"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
