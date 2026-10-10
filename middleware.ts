import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge middleware: checks the session cookie only (fast, no database).
// Pages, server actions and APIs still check on the server (lib/auth-guards.ts).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/account/:path*", "/checkout/:path*", "/orders/:path*", "/admin/:path*"],
};
