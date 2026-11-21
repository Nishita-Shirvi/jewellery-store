"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Keeps <html data-area> right after in-app navigation (the root layout isn't re-rendered then):
 * "admin" on /admin pages keeps the admin look; everything else gets the shop look.
 */
export function AreaSync() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const admin = pathname === "/admin" || pathname.startsWith("/admin/");
    document.documentElement.dataset.area = admin ? "admin" : "shop";
  }, [pathname]);
  return null;
}
