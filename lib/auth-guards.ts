import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { getUserRole } from "@/services/auth.service";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Please log in to continue.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You don't have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The signed-in user, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    role: session.user.role,
  };
}

/** For server actions and API routes. Throws UnauthorizedError (401). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * For server actions and API routes. Throws 401/403.
 * The role is re-read from the database, so a demoted admin loses access immediately
 * even though their session cookie still says ADMIN.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  const role = await getUserRole(user.id);
  if (role !== "ADMIN") {
    logger.warn("auth.admin_forbidden", { userId: user.id });
    throw new ForbiddenError();
  }
  return { ...user, role };
}

/** For pages and layouts: redirects to /login instead of throwing. */
export async function requireUserPage(callbackUrl: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}

/** For pages and layouts: redirects to /login or /forbidden. */
export async function requireAdminPage(callbackUrl = "/admin"): Promise<SessionUser> {
  const user = await requireUserPage(callbackUrl);
  const role = await getUserRole(user.id);
  if (role !== "ADMIN") redirect("/forbidden");
  return { ...user, role };
}
