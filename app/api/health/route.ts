import { NextResponse } from "next/server";
import { getHealth } from "@/services/health.service";
import type { HealthResponse } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — 200 when the app and database are reachable, 503 otherwise. */
export async function GET(): Promise<NextResponse<HealthResponse>> {
  const health = await getHealth();
  return NextResponse.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
