import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/** Web app manifest (Phase 23): lets customers install the store on their phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: publicEnv.NEXT_PUBLIC_SITE_NAME,
    short_name: publicEnv.NEXT_PUBLIC_SITE_NAME.slice(0, 12),
    description: "Hallmarked gold, sterling silver and certified diamonds.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf7f4",
    theme_color: "#4a1528",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
