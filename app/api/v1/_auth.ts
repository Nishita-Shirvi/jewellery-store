import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { authenticateApiKey } from "@/services/integrations.service";

/** API key check + per-key rate limit for the public API. Returns a response to send, or the key id. */
export async function apiGuard(request: Request): Promise<NextResponse | string> {
  const keyId = await authenticateApiKey(request.headers.get("authorization"));
  if (!keyId)
    return NextResponse.json(
      {
        error: {
          code: "unauthorized",
          message: "Send 'Authorization: Bearer <API key>'. Keys: Admin → Integrations.",
        },
      },
      { status: 401 },
    );
  if (!rateLimit(`api:${keyId}`, 120, 60_000).ok)
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Up to 120 requests a minute." } },
      { status: 429 },
    );
  return keyId;
}
