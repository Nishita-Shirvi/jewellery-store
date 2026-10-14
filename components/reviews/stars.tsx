import { Star, StarHalf } from "lucide-react";
import { formatRating, starFill } from "@/lib/reviews";

/** Read-only star display with an accessible label, e.g. "Rated 4.7 out of 5". */
export function Stars({ avgX100, size = 14 }: { avgX100: number; size?: number }) {
  return (
    <span
      className="text-gold inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${formatRating(avgX100)} out of 5`}
    >
      {starFill(avgX100).map((f, i) =>
        f === "half" ? (
          <StarHalf
            key={i}
            width={size}
            height={size}
            className="fill-current"
            aria-hidden="true"
          />
        ) : (
          <Star
            key={i}
            width={size}
            height={size}
            className={f === "full" ? "fill-current" : "opacity-35"}
            aria-hidden="true"
          />
        ),
      )}
    </span>
  );
}
