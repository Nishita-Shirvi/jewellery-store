import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import type { Permission } from "@/lib/permissions";
import {
  TWO_FACTOR_COOKIE,
  getStaffAccess,
  twoFactorCookieValid,
  type StaffAccess,
} from "@/services/staff.service";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
}

/** A staff member who has passed two-step sign-in, with their permissions. */
export interface StaffUser extends SessionUser {
  permissions: Permission[];
  roleKeys: string[];
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

async function twoFactorPassed(userId: string, access: StaffAccess): Promise<boolean> {
  const value = (await cookies()).get(TWO_FACTOR_COOKIE)?.value;
  return twoFactorCookieValid(value, userId, access.totpEnabledAt);
}

/** Records a refused admin request in the activity log (who tried what). Never throws. */
async function recordDenied(user: SessionUser, what: string, reason: string) {
  logger.warn("auth.admin_forbidden", { userId: user.id, what, reason });
  try {
    const { audit } = await import("@/services/audit.service");
    await audit(
      { id: user.id, email: user.email },
      {
        action: "auth.denied",
        entityType: "staff",
        entityId: user.id,
        summary: `Refused: ${what} (${reason})`,
      },
    );
  } catch {
    /* logging must never turn a 403 into a 500 */
  }
}

/**
 * For server actions and API routes: a staff member (role, active and 2FA re-checked in the
 * database / cookie on every call). Throws 401 / 403. A demoted or deactivated person loses
 * access immediately, even though their session cookie still says ADMIN.
 */
export async function requireStaff(): Promise<StaffUser> {
  const user = await requireUser();
  const access = await getStaffAccess(user.id);
  if (!access.isStaff) {
    await recordDenied(user, "admin area", "not staff");
    throw new ForbiddenError();
  }
  if (!(await twoFactorPassed(user.id, access))) {
    await recordDenied(user, "admin area", "two-step sign-in not completed");
    throw new ForbiddenError("Complete two-step sign-in first.");
  }
  return { ...user, role: "ADMIN", permissions: access.permissions, roleKeys: access.roleKeys };
}

/** For server actions and API routes: a staff member who has this permission. */
export async function requirePermission(permission: Permission): Promise<StaffUser> {
  const staff = await requireStaff();
  if (!staff.permissions.includes(permission)) {
    await recordDenied(staff, permission, "missing permission");
    throw new ForbiddenError();
  }
  return staff;
}

/** Kept for older callers: any staff member who passed two-step sign-in. */
export async function requireAdmin(): Promise<StaffUser> {
  return requireStaff();
}

/** For pages and layouts: redirects to /login instead of throwing. */
export async function requireUserPage(callbackUrl: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return user;
}

/** For pages: staff who passed two-step sign-in; otherwise /login, /forbidden or /staff/2fa. */
export async function requireStaffPage(callbackUrl = "/admin"): Promise<StaffUser> {
  const user = await requireUserPage(callbackUrl);
  const access = await getStaffAccess(user.id);
  if (!access.isStaff) redirect("/forbidden");
  if (!(await twoFactorPassed(user.id, access)))
    redirect(`/staff/2fa?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return { ...user, role: "ADMIN", permissions: access.permissions, roleKeys: access.roleKeys };
}

/** For admin pages that need a permission. */
export async function requirePermissionPage(
  permission: Permission,
  callbackUrl: string,
): Promise<StaffUser> {
  const staff = await requireStaffPage(callbackUrl);
  if (!staff.permissions.includes(permission)) {
    await recordDenied(staff, `${permission} (page ${callbackUrl})`, "missing permission");
    redirect("/forbidden");
  }
  return staff;
}

/** Kept for older callers. */
export async function requireAdminPage(callbackUrl = "/admin"): Promise<StaffUser> {
  return requireStaffPage(callbackUrl);
}

/**
 * Quiet check for routes that serve both customers and staff (e.g. invoice PDFs): true only for
 * staff who passed two-step sign-in and have the permission. Never throws, never logs customers.
 */
export async function staffHasPermission(userId: string, permission: Permission): Promise<boolean> {
  const access = await getStaffAccess(userId);
  if (!access.isStaff || !access.permissions.includes(permission)) return false;
  return twoFactorPassed(userId, access);
}
