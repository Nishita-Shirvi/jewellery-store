"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";

/**
 * Full-page background for the log-in and create-account pages (Admin → Appearance → Sign-in &
 * top bar): the still picture, and over it a muted, looping video. The video only downloads and
 * plays when the shopper hasn't asked for reduced motion or data saving. A pause button lets
 * anyone stop the movement (WCAG 2.2.2).
 */
export function AuthBackdrop({ video, poster }: { video: string | null; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // The button appears once the video has started (never for reduced motion / data saver).
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const v = ref.current;
    // A new video starts hidden-button until it actually plays.
    setStarted(false);
    setPlaying(false);
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData;
    if (reduce || saveData) return;
    v.preload = "auto";
    v.play().catch(() => undefined);
  }, [video]);

  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden bg-black">
        <Image
          src={poster}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          unoptimized={poster.endsWith(".svg")}
        />
        {video && (
          <video
            ref={ref}
            key={video}
            muted
            loop
            playsInline
            preload="none"
            tabIndex={-1}
            onPlaying={() => {
              setPlaying(true);
              setStarted(true);
            }}
            onPause={() => setPlaying(false)}
            className="absolute inset-0 size-full object-cover"
            data-testid="auth-video"
          >
            <source
              src={video}
              type={video.toLowerCase().includes(".webm") ? "video/webm" : "video/mp4"}
            />
          </video>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(20,6,10,.72),rgba(20,6,10,.5))]" />
      </div>
      {video && started && (
        <button
          type="button"
          onClick={() => {
            const v = ref.current;
            if (!v) return;
            if (v.paused) v.play().catch(() => undefined);
            else v.pause();
          }}
          aria-label={playing ? "Pause background video" : "Play background video"}
          className="absolute right-4 bottom-4 z-10 grid size-9 place-items-center rounded-full border border-white/40 bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      )}
    </>
  );
}
