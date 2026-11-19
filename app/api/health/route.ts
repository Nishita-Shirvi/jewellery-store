import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { withRequestId } from "@/lib/request-context";
import { getDeepHealth, getHealth } from "@/services/health.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — 200 when the app and database are reachable, 503 otherwise.
 * GET /api/health?deep=1 with "Authorization: Bearer <CRON_SECRET>" (Phase 26) — also scheduler,
 * job and alert status, for the uptime check. Without the secret, deep details aren't shown.
 */
async function handleGET(request: Request) {
  const deep =
    new URL(request.url).searchParams.get("deep") === "1" &&
    isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET);
  const health = deep ? await getDeepHealth() : await getHealth();
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withRequestId(handleGET);
