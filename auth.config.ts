import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Edge-safe Auth.js config: no database, no bcrypt. Used by middleware.ts.
 * The full config (providers + Prisma adapter) lives in auth.ts.
 */

/** Set by middleware on /admin requests: the page that was asked for (read by the admin layout). */
export const ADMIN_PATH_HEADER = "x-admin-path";

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

      // No role check here: the cookie's role can be stale (someone who just accepted a staff
      // invitation still has a CUSTOMER cookie). The admin layout, pages, actions and APIs check
      // staff status, two-step sign-in and permissions in the database on every request.

      // Tell the admin layout which page was asked for, so two-step sign-in can return there.
      if (matchesPrefix(pathname, "/admin")) {
        const headers = new Headers(request.headers);
        headers.set(ADMIN_PATH_HEADER, `${pathname}${search}`);
        return NextResponse.next({ request: { headers } });
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
