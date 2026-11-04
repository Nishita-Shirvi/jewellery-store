import "server-only";
import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";

const BCRYPT_ROUNDS = 12;

// Compared against when the email doesn't exist, so a wrong email takes as long as a
// wrong password (stops attackers from discovering which emails are registered).
const DUMMY_HASH = "$2b$12$bX2QHD39lNSS.QmDt5bGB.MY71BVcthTW0G31EjIiymWbLwvUcGQq";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Wrong passwords in a row before the account is locked, and for how long. */
export const LOCK_AFTER_FAILURES = 8;
export const LOCK_MINUTES = 15;

export class AccountLockedError extends Error {
  constructor() {
    super("Account temporarily locked");
    this.name = "AccountLockedError";
  }
}

/**
 * Returns the user when email + password match, otherwise null. Throws AccountLockedError while
 * the account is locked (the password isn't even checked then). The lock lives in the database,
 * so it holds across every server instance — unlike the in-memory per-IP rate limit.
 */
export async function verifyCredentials(input: LoginInput): Promise<AuthenticatedUser | null> {
  const user = await db.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      lockedUntil: true,
    },
  });

  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (user?.lockedUntil && user.lockedUntil > new Date()) throw new AccountLockedError();
  if (!user || !user.passwordHash) return null;

  if (!valid) {
    const after = await db.user.update({
      where: { id: user.id },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    if (after.failedLogins >= LOCK_AFTER_FAILURES) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
      });
      throw new AccountLockedError();
    }
    return null;
  }

  await db.user.updateMany({
    where: { id: user.id, OR: [{ failedLogins: { gt: 0 } }, { lockedUntil: { not: null } }] },
    data: { failedLogins: 0, lockedUntil: null },
  });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Creates a CUSTOMER account. Throws EmailAlreadyRegisteredError if the email is taken. */
export async function registerUser(input: RegisterInput): Promise<AuthenticatedUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: "CUSTOMER" },
      select: { id: true, email: true, name: true, role: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new EmailAlreadyRegisteredError();
    }
    throw error;
  }
}

/** Current role straight from the database (used for admin checks, never trusts the cookie alone). */
export async function getUserRole(userId: string): Promise<Role | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}
