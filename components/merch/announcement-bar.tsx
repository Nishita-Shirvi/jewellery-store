import Link from "next/link";
import { getLiveAnnouncement } from "@/services/merch.service";

/**
 * Thin bar above the header (Phase 24). Shows the live announcement with the highest priority;
 * scheduled ones appear and disappear on their own. Renders nothing when none is live, and
 * never breaks the page if the database is unreachable.
 */
export async function AnnouncementBar() {
  const a = await getLiveAnnouncement().catch(() => null);
  if (!a) return null;
  const external = a.linkUrl?.startsWith("https://");
  return (
    <div
      role="region"
      aria-label="Announcement"
      className="bg-primary text-primary-foreground px-4 py-2 text-center text-sm"
      data-testid="announcement"
    >
      <span>{a.message}</span>
      {a.linkUrl && (
        <>
          {" "}
          <Link
            href={a.linkUrl}
            className="font-medium underline underline-offset-4"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {a.linkLabel ?? "Shop now"}
          </Link>
        </>
      )}
    </div>
  );
}
