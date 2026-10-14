import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { suggestProducts } from "@/services/search.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/search/suggest?q=jhum → up to 6 matching pieces for the header search box. */
export async function GET(request: Request) {
  if (!rateLimit(`suggest:${getClientIp(request.headers)}`, 120, 60_000).ok) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  const suggestions = q.length >= 2 ? await suggestProducts(q) : [];
  return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "public, max-age=60" } });
}
