import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { REFERRAL_COOKIE } from "@/services/marketing.service";

export const dynamic = "force-dynamic";

/**
 * GET /r/<code> — a customer's referral link. Remembers the code for 30 days (cookie) and opens
 * the shop; it's linked to the account when the friend signs up.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/", request.url));
  const clean = code.toUpperCase();
  if (/^[A-Z0-9]{6,12}$/.test(clean))
    res.cookies.set(REFERRAL_COOKIE, clean, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
  return res;
}
