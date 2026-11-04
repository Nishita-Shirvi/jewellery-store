import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Price with an optional crossed-out "was" price and "% off" badge (Phase 24).
 * The % comes from the server (lib/merch.ts percentOff); this only displays it.
 */
export function Price({
  priceInPaise,
  compareAtPriceInPaise,
  percentOff,
  size = "sm",
  testId,
}: {
  priceInPaise: number;
  compareAtPriceInPaise?: number | null;
  percentOff?: number | null;
  size?: "sm" | "lg";
  testId?: string;
}) {
  const onSale = Boolean(percentOff && compareAtPriceInPaise);
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={cn("font-semibold", size === "lg" ? "text-2xl" : "text-sm")}
        data-testid={testId}
      >
        {formatINR(priceInPaise)}
      </span>
      {onSale && (
        <>
          <s
            className={cn("text-muted-foreground", size === "lg" ? "text-base" : "text-xs")}
            data-testid={testId ? `${testId}-was` : undefined}
          >
            <span className="sr-only">Was </span>
            {formatINR(compareAtPriceInPaise!)}
          </s>
          <span
            className={cn(
              "rounded bg-emerald-700 px-1.5 py-0.5 font-medium text-white",
              size === "lg" ? "text-sm" : "text-[11px]",
            )}
          >
            {percentOff}% off
          </span>
        </>
      )}
    </p>
  );
}
