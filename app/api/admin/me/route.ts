import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/admin/me — 200 for staff who passed two-step sign-in, 403 otherwise, 401 signed out. */
export async function GET() {
  try {
    const admin = await requireStaff();
    return NextResponse.json({ user: admin });
  } catch (error) {
    return errorResponse(error);
  }
}
