import { config } from "@/lib/config";
import { purityLabel } from "@/lib/jewellery";
import { formatINR } from "@/lib/format";
import { getCurrentRates } from "@/services/metal-rate.service";

const updatedFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/**
 * The thin strip at the top of the header: today's metal rates when there are any (and
 * [features] rate_strip is on) plus the standing message from config/storefront.ini. Time-limited
 * offers go in Admin → Content → announcement bar, which shows above this strip.
 */
export async function RateStrip() {
  const rates = config.features.rate_strip ? await getCurrentRates() : {};
  const shown = config.pricing.strip_purities.flatMap((p) => {
    const r = rates[p];
    return r ? [{ purity: p, ...r }] : [];
  });
  const announcement = config.storefront.announcement.replace(
    "{free_above}",
    config.shipping.free_above_rupees.toLocaleString("en-IN"),
  );

  if (shown.length === 0) {
    return (
      <p className="bg-alt border-line text-foreground border-b px-4 py-2 text-center text-xs sm:text-[13px]">
        {announcement}
      </p>
    );
  }

  const newest = shown.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
  return (
    <div className="bg-alt border-line text-foreground border-b text-xs sm:text-[13px]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-6 gap-y-0.5 px-4 py-2 tabular-nums md:justify-between">
        <p aria-label="Today's metal rates" className="flex flex-wrap justify-center gap-x-5">
          <span className="text-eyebrow text-[11px] font-bold tracking-[0.16em] uppercase sm:text-xs">
            Today&apos;s rate
          </span>
          {shown.map((r) => (
            <span key={r.purity}>
              <strong className="font-bold">{purityLabel[r.purity]}</strong>{" "}
              {formatINR(r.ratePerGramInPaise)}/g
            </span>
          ))}
          <span className="text-muted-foreground">
            (updated {updatedFmt.format(new Date(newest.updatedAt))})
          </span>
        </p>
        <p className="text-muted-foreground hidden md:block">{announcement}</p>
      </div>
    </div>
  );
}
