import Link from "next/link";
import { publicEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * The shop name set as a wordmark: the first word large and spaced, the rest small underneath
 * ("VINEET / JEWELLERS"). Capitals come from CSS, so screen readers read the name normally.
 */
export function Wordmark({
  href,
  className,
  size = "md",
}: {
  href?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [first, ...rest] = publicEnv.NEXT_PUBLIC_SITE_NAME.trim().split(/\s+/);
  const content = (
    <>
      <span>{first}</span>
      {rest.length > 0 && (
        <small
          className={cn(
            "mt-1 font-sans font-semibold",
            size === "sm"
              ? "text-[8px] tracking-[0.6em]"
              : "text-[8px] tracking-[0.5em] sm:text-[9.5px] sm:tracking-[0.62em]",
          )}
        >
          {" "}
          {rest.join(" ")}
        </small>
      )}
    </>
  );
  const classes = cn(
    "text-wordmark flex flex-col items-start leading-none uppercase",
    size === "sm"
      ? "text-[22px] tracking-[0.2em]"
      : "text-2xl tracking-[0.14em] sm:text-[30px] sm:tracking-[0.2em]",
    className,
  );
  const style = { fontFamily: "var(--font-display)", fontWeight: 500 };
  return href ? (
    <Link href={href} className={classes} style={style}>
      {content}
    </Link>
  ) : (
    <span className={classes} style={style}>
      {content}
    </span>
  );
}
