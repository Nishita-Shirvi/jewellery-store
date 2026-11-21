"use client";

import { useEffect, useRef } from "react";

/**
 * The theme's background video: muted, looping, decorative. It only starts downloading and
 * playing when the shopper hasn't asked for reduced motion or data saving; otherwise the still
 * photo (poster) stays.
 */
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    if (reduce || saveData) return;
    video.preload = "auto";
    video.play().catch(() => undefined);
  }, [src]);
  return (
    <video
      ref={ref}
      key={src}
      muted
      loop
      playsInline
      preload="none"
      poster={poster}
      aria-hidden="true"
      tabIndex={-1}
      className="absolute inset-0 size-full object-cover"
    >
      <source src={src} type={src.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4"} />
    </video>
  );
}
