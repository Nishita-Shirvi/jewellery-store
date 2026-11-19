import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { addAttribution, ATTRIBUTION_COOKIE, ATTRIBUTION_DAYS, isWidget } from "@/lib/reco";
import { recordRecoEvent } from "@/services/reco.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * POST /api/reco/event — what shoppers did with recommendation rows (Phase 25):
 *   {widget, event: "impression"}           a row came into view (counted in batches)
 *   {widget, event: "click", slug}          a product was opened from a row: counted, and
 *                                           remembered in an http-only cookie so adding it to
 *                                           the cart or buying it is credited to the row.
 * Same-site only; limited per visitor; always 204 so it reveals nothing.
 */
export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return done;
  if (!rateLimit(`reco-event:${getClientIp(request.headers)}`, 120, 60_000).ok) return done;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return done;
  }
  const { widget, event, slug } = (body ?? {}) as {
    widget?: unknown;
    event?: unknown;
    slug?: unknown;
  };
  if (!isWidget(widget)) return done;

  if (event === "impression") {
    after(() => recordRecoEvent(widget, "impression"));
    return done;
  }
  if (event !== "click" || typeof slug !== "string" || slug.length > 120 || !SLUG_RE.test(slug))
    return done;
  const product = await db.product.findUnique({
    where: { slug },
    select: { id: true, isActive: true },
  });
  if (!product?.isActive) return done;

  after(() => recordRecoEvent(widget, "click"));
  const current = request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`))
    ?.slice(ATTRIBUTION_COOKIE.length + 1);
  done.cookies.set(ATTRIBUTION_COOKIE, addAttribution(current, product.id, widget), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ATTRIBUTION_DAYS * 86_400,
  });
  return done;
}
