import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { errorMessage, logger } from "@/lib/logger";
import { sendLowStockAlert } from "@/services/alert.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cron/low-stock — emails admins the low-stock list (once per day). */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await sendLowStockAlert()) });
  } catch (error) {
    logger.error("cron.low_stock_failed", { error: errorMessage(error) });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
