import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { errorMessage, logger } from "@/lib/logger";
import { releaseExpiredReservations } from "@/services/inventory.service";
import { revalidateTag } from "next/cache";
import { CATALOG_TAG } from "@/services/catalog.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/release-reservations
 * Closes unpaid orders older than 15 minutes and gives their stock back.
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
    logger.info("cron.release_reservations", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    logger.error("cron.release_reservations_failed", { error: errorMessage(error) });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
