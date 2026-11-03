import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { cronTick } from "@/services/cron.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/release-reservations
 * Kept for existing schedules: same as /api/cron/jobs (releases expired stock holds as a job and
 * runs every due background job).
 */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    logger.warn("cron.unauthorized", { path: "release-reservations" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await cronTick()) });
  } catch (error) {
    logger.error("cron.release_reservations_failed", { error });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
