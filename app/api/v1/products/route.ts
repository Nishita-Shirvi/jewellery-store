import { NextResponse } from "next/server";
import { withRequestId } from "@/lib/request-context";
import { apiListProducts } from "@/services/public-api.service";
import { apiGuard } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/products?page=1&limit=50&category=rings&updated_since=2026-11-01T00:00:00Z */
async function handleGET(request: Request) {
  const guard = await apiGuard(request);
  if (typeof guard !== "string") return guard;
  const q = new URL(request.url).searchParams;
  const page = Math.min(Math.max(1, Number.parseInt(q.get("page") ?? "1", 10) || 1), 10_000);
  const limit = Math.min(Math.max(1, Number.parseInt(q.get("limit") ?? "50", 10) || 50), 100);
  const category = q.get("category") ?? undefined;
  if (category && !/^[a-z0-9-]{1,80}$/.test(category))
    return NextResponse.json(
      { error: { code: "bad_request", message: "category must be a category slug" } },
      { status: 400 },
    );
  const since = q.get("updated_since");
  const updatedSince = since ? new Date(since) : undefined;
  if (updatedSince && Number.isNaN(updatedSince.getTime()))
    return NextResponse.json(
      { error: { code: "bad_request", message: "updated_since must be an ISO date" } },
      { status: 400 },
    );
  return NextResponse.json(await apiListProducts({ page, limit, category, updatedSince }), {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withRequestId(handleGET);
