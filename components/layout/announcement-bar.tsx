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
 * The thin bar above the header: today's metal rates when there are any (and the rate strip is on),
 * otherwise the announcement text from config/storefront.ini.
 */
export async function AnnouncementBar() {
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
      <p className="bg-primary text-primary-foreground px-4 py-1.5 text-center text-xs">
        {announcement}
      </p>
    );
  }

  const newest = shown.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
  return (
    <div className="bg-primary text-primary-foreground text-xs">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-0.5 px-4 py-1.5 md:justify-between">
        <p aria-label="Today's metal rates">
          <span className="mr-2 font-medium text-[#e8c987]">Today&apos;s rate</span>
          {shown.map((r, i) => (
            <span key={r.purity}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              {purityLabel[r.purity]} {formatINR(r.ratePerGramInPaise)}/g
            </span>
          ))}
          <span className="ml-2 opacity-75">
            (updated {updatedFmt.format(new Date(newest.updatedAt))})
          </span>
        </p>
        <p className="hidden opacity-90 md:block">{announcement}</p>
      </div>
    </div>
  );
}
