import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { decodeEmail, verifyEmailLink } from "@/lib/marketing";
import { unsubscribe } from "@/services/marketing.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/unsubscribe?e=…&t=… — one-click unsubscribe (RFC 8058) used by Gmail/Outlook's
 * "Unsubscribe" button via the List-Unsubscribe header. Signed link; POST only, so mail scanners
 * that open links can't unsubscribe anyone.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const email = decodeEmail(url.searchParams.get("e") ?? "");
  const token = url.searchParams.get("t") ?? "";
  if (!email || !verifyEmailLink(email, "unsubscribe", token, env.AUTH_SECRET))
    return NextResponse.json({ error: "invalid_link" }, { status: 400 });
  await unsubscribe(email, "one-click");
  return NextResponse.json({ ok: true });
}
