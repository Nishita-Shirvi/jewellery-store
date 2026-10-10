import Image from "next/image";
import { cn } from "@/lib/utils";

interface ProductImageProps {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

/** Square product image. SVG placeholders skip optimisation (Next.js doesn't optimise SVG). */
export function ProductImage({ src, alt, priority, sizes, className }: ProductImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={800}
      height={800}
      priority={priority}
      sizes={sizes ?? "(min-width: 768px) 25vw, 50vw"}
      unoptimized={src.endsWith(".svg")}
      className={cn("aspect-square w-full object-cover", className)}
    />
  );
}
