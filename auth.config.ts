import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Edge-safe Auth.js config: no database, no bcrypt. Used by middleware.ts.
 * The full config (providers + Prisma adapter) lives in auth.ts.
 */

const PROTECTED_PREFIXES = ["/account", "/checkout", "/orders", "/admin"];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    // Credentials login requires JWT sessions. Role is copied into the token at sign-in;
    // admin actions re-check the role in the database (lib/auth-guards.ts).
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.role = user.role ?? "CUSTOMER";
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id;
      session.user.role = token.role ?? "CUSTOMER";
      return session;
    },
    /** Runs in middleware for every matched route. */
    authorized({ auth, request }) {
      const { pathname, search } = request.nextUrl;
      const needsLogin = PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
      if (!needsLogin) return true;

      if (!auth?.user) {
        const loginUrl = new URL("/login", request.nextUrl.origin);
        loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
        return NextResponse.redirect(loginUrl);
      }

      if (matchesPrefix(pathname, "/admin") && auth.user.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/forbidden", request.nextUrl.origin));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
