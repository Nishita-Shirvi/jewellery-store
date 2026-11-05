import { NextResponse } from "next/server";
import { withRequestId } from "@/lib/request-context";
import { apiGetProduct } from "@/services/public-api.service";
import { apiGuard } from "../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/products/<slug> */
async function handleGET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const guard = await apiGuard(request);
  if (typeof guard !== "string") return guard;
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug))
    return NextResponse.json(
      { error: { code: "not_found", message: "No such product" } },
      { status: 404 },
    );
  const product = await apiGetProduct(slug);
  if (!product)
    return NextResponse.json(
      { error: { code: "not_found", message: "No such product" } },
      { status: 404 },
    );
  return NextResponse.json({ data: product }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withRequestId(handleGET);
