import "server-only";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth-guards";
import { logger } from "@/lib/logger";

export interface ApiErrorBody {
  error: string;
  /** Reference to quote when reporting a problem; search the logs for it (errorId). */
  errorId?: string;
}

/**
 * Turns known errors into JSON responses; anything else becomes a 500 without details,
 * plus a short errorId that is also written to the log line with the full stack.
 */
export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const errorId = crypto.randomUUID().slice(0, 8);
  logger.error("api.unexpected_error", { errorId, error });
  return NextResponse.json({ error: "Something went wrong.", errorId }, { status: 500 });
}
