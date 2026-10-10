import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/account/me — the signed-in user (401 if not signed in). */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
