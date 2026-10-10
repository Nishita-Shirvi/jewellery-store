import "server-only";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth-guards";

export interface ApiErrorBody {
  error: string;
}

/** Turns known errors into JSON responses; anything else becomes a 500 without details. */
export function errorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[api] unexpected error", error);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
