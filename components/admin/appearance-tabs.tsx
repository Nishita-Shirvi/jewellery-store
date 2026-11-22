import Link from "next/link";
import { cn } from "@/lib/utils";

/** Themes | Popup | Sign-in & top bar, at the top of Admin → Appearance. */
export function AppearanceTabs({ current }: { current: "themes" | "popup" | "entrance" }) {
  const tabs = [
    { key: "themes", href: "/admin/appearance", label: "Festival themes" },
    { key: "popup", href: "/admin/appearance/popup", label: "Popup" },
    { key: "entrance", href: "/admin/appearance/sign-in", label: "Sign-in & top bar" },
  ] as const;
  return (
    <nav aria-label="Appearance" className="border-border flex gap-1 border-b text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={current === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2",
            current === t.key
              ? "border-primary font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
