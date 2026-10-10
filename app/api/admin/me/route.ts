import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/admin/me — 200 for admins, 403 for customers, 401 when signed out. */
export async function GET() {
  try {
    const admin = await requireAdmin();
    return NextResponse.json({ user: admin });
  } catch (error) {
    return errorResponse(error);
  }
}
