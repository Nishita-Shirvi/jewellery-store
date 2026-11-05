import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { parseRecent } from "@/lib/reco";
import {
  getBoughtTogether,
  getCartBoughtTogether,
  getFreeShippingUpsell,
  getRecentlyViewed,
  getSimilar,
  getTrending,
  type RecoCard,
} from "@/services/reco.service";
import { isOff } from "@/services/switches.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9]{8,40}$/i;
const ids = (v: string | null) =>
  [...new Set((v ?? "").split(",").filter((x) => ID_RE.test(x)))].slice(0, 30).sort();

/**
 * GET /api/reco?w=<widget>&… → product cards for one recommendation row (Phase 25).
 *
 * Rows load in the browser after the page, so pages render exactly as fast as before. The
 * answer depends only on the URL (nothing personal: "recently viewed" sends its own list), so
 * the CDN can cache it: on Vercel, repeat requests never reach the server.
 *   similar / bought_together: &id=<productId>
 *   trending
 *   recent: &slugs=a.b.c&ex=<slug>
 *   upsell: &gap=<paise>&ids=<productId,…>   (cart)
 *   cart: &ids=<productId,…>                  ("customers also bought")
 */
export async function GET(request: Request) {
  if (!rateLimit(`reco:${getClientIp(request.headers)}`, 240, 60_000).ok)
    return NextResponse.json({ items: [] }, { status: 429 });
  const q = new URL(request.url).searchParams;
  const w = q.get("w");
  const id = q.get("id") ?? "";
  let items: RecoCard[] = [];
  // Kill switch (Phase 30): rows disappear; not cached, so they come back as soon as it's on.
  if (await isOff("recommendations"))
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  try {
    if ((w === "similar" || w === "bought_together") && ID_RE.test(id)) {
      items = w === "similar" ? await getSimilar(id, 4) : await getBoughtTogether(id, 4);
    } else if (w === "trending") {
      items = await getTrending(8);
    } else if (w === "recent") {
      const ex = q.get("ex") ?? undefined;
      items = (await getRecentlyViewed(parseRecent(q.get("slugs")), ex)).slice(0, 6);
    } else if (w === "upsell") {
      const gap = Number(q.get("gap"));
      if (Number.isInteger(gap) && gap > 0 && gap < 1e9)
        items = await getFreeShippingUpsell(gap, ids(q.get("ids")));
    } else if (w === "cart") {
      items = await getCartBoughtTogether(ids(q.get("ids")));
    } else {
      return NextResponse.json({ items: [] }, { status: 400 });
    }
  } catch {
    items = []; // recommendations never break a page
  }
  return NextResponse.json(
    { items },
    {
      headers: {
        // Browsers always ask again (a stale-while-revalidate here would show an outdated row
        // once); only the CDN keeps a copy, for 5 minutes.
        "Cache-Control": "public, max-age=0, must-revalidate",
        "CDN-Cache-Control": "max-age=300, stale-while-revalidate=600",
        "Vercel-CDN-Cache-Control": "max-age=300, stale-while-revalidate=600",
      },
    },
  );
}
