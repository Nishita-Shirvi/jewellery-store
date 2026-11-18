import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { releaseExpiredReservations } from "@/services/inventory.service";
import { sendStuckRefunds } from "@/services/refund.service";
import { revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/services/catalog.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/release-reservations
 * Closes unpaid orders whose stock hold ([inventory] reservation_minutes) ran out and gives their stock back.
 * Called every few minutes by Vercel Cron or the GitHub Actions schedule (see Docs/DEPLOY.md).
 */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), env.CRON_SECRET)) {
    logger.warn("cron.unauthorized", { path: "release-reservations" });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await releaseExpiredReservations();
    if (result.released > 0) revalidateTag(CATALOG_TAG);
    // Also send refunds that a crash left unsent (PENDING, never reached Razorpay, 10+ min old).
    const refunds = await sendStuckRefunds();
    logger.info("cron.release_reservations", { ...result, stuckRefunds: refunds.found });
    return NextResponse.json({ ok: true, ...result, stuckRefunds: refunds.found });
  } catch (error) {
    logger.error("cron.release_reservations_failed", { error });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
