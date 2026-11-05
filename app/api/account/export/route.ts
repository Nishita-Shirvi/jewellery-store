import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-guards";
import { rateLimit } from "@/lib/rate-limit";
import { withRequestId } from "@/lib/request-context";
import { exportUserData } from "@/services/privacy.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/account/export — "Download my data" (Phase 27): the signed-in customer's own data. */
async function handleGET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`export:${user.id}`, 5, 60 * 60_000).ok)
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withRequestId(handleGET);
