import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { cronTick } from "@/services/cron.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cron/low-stock — queues the daily low-stock email (sent at most once per day) and runs due jobs. */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await cronTick({ lowStock: true })) });
  } catch (error) {
    logger.error("cron.low_stock_failed", { error });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
