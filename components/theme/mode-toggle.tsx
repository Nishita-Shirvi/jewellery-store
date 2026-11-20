"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { MODE_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
  return () => {
    media.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/** Is the shop showing dark right now (chosen, or following a device set to dark)? */
function isDark() {
  const mode = document.documentElement.dataset.mode;
  return mode === "dark" || (mode === "system" && window.matchMedia(DARK_QUERY).matches);
}

/**
 * Sun/moon button in the shop header. Switches light/dark at once and remembers the choice in a
 * cookie for a year, so the next page arrives in the right mode (no flash). Switching back to
 * what the device shows clears the cookie, so the shop follows the device again. Hidden on admin
 * pages (admin has no dark mode).
 */
export function ModeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = isDark() ? "light" : "dark";
    const device = window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
    // Choosing what the device already shows means "follow the device" again (no cookie).
    const mode = next === device ? "system" : next;
    document.documentElement.dataset.mode = mode;
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie =
      mode === "system"
        ? `${MODE_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`
        : `${MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax${secure}`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label="Dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "border-gilt/55 hover:bg-on/10 focus-visible:ring-gilt grid size-9 place-items-center rounded-full border outline-none focus-visible:ring-2 [html[data-area=admin]_&]:hidden",
        className,
      )}
    >
      {/* Both icons are in the page; CSS shows the right one before any script runs. */}
      <Moon className="size-[18px] dark:hidden" aria-hidden="true" />
      <Sun className="hidden size-[18px] dark:block" aria-hidden="true" />
    </button>
  );
}
