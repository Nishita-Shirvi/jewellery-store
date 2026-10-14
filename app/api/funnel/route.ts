import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { countFunnel } from "@/services/report.service";

export const runtime = "nodejs";

/**
 * POST /api/funnel {"event":"view_item"} — counts a product view from the browser, once per
 * real visit (server re-renders after add-to-cart would otherwise double count, and bots
 * without JavaScript aren't counted). Other funnel steps are counted on the server.
 */
export async function POST(request: Request) {
  if (!rateLimit(`funnel:${getClientIp(request.headers)}`, 120, 60_000).ok)
    return new NextResponse(null, { status: 204 });
  const body = (await request.json().catch(() => null)) as { event?: string } | null;
  if (body?.event === "view_item") await countFunnel("view_item");
  return new NextResponse(null, { status: 204 });
}
