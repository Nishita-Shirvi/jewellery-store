import Link from "next/link";
import { getLiveAnnouncement } from "@/services/merch.service";

/** "*Diwali offer:* 20% off" → the words between stars are highlighted in gold. */
function emphasised(message: string) {
  return message.split(/\*([^*]+)\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <em key={i} className="text-goldlight font-bold not-italic">
        {part}
      </em>
    ) : (
      part
    ),
  );
}

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
      className="bg-deep text-on px-4 py-2 text-center text-[12.5px] tracking-wide"
      data-testid="announcement"
    >
      <span>{emphasised(a.message)}</span>
      {a.linkUrl && (
        <>
          {" "}
          <Link
            href={a.linkUrl}
            className="font-semibold underline underline-offset-4"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {a.linkLabel ?? "Shop now"}
          </Link>
        </>
      )}
    </div>
  );
}
