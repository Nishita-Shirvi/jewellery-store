import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { cronTick } from "@/services/cron.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/jobs — runs background jobs that are due (and their retries), releases expired
 * stock holds. Call every few minutes (GitHub Actions schedule; see Docs/DEPLOY.md).
 */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    logger.warn("cron.unauthorized", { path: "jobs" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await cronTick()) });
  } catch (error) {
    logger.error("cron.jobs_failed", { error });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
