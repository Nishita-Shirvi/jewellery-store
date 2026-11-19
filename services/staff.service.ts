import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { normaliseEmail, randomCode } from "@/lib/marketing";
import { ROLE_KEYS, isPermission, type Permission, type RoleKey } from "@/lib/permissions";
import { open, seal } from "@/lib/secret-box";
import { generateTotpSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { enqueue, kickJobs } from "@/services/jobs.service";

/**
 * Staff (Phase 21): who may do what in the admin, two-step sign-in, invites.
 *
 * - "Staff" = User.role ADMIN and not deactivated. What they may do = the permissions of their
 *   roles, read from the database on every request (a change applies at once).
 * - Every staff member must pass two-step sign-in (authenticator app) before any admin page or
 *   action: a signed cookie proves it for 12 hours. It's bound to when 2FA was set up, so
 *   resetting someone's 2FA logs them out of the admin everywhere.
 */

export class StaffError extends Error {}

type Tx = Prisma.TransactionClient;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const TOTP_PURPOSE = "totp";
export const TWO_FACTOR_COOKIE = "staff_2fa";
export const TWO_FACTOR_HOURS = 12;
const INVITE_DAYS = 7;

// ───────────────────────── access ─────────────────────────

export interface StaffAccess {
  isStaff: boolean;
  permissions: Permission[];
  roleKeys: string[];
  totpEnabledAt: Date | null;
}

export async function getStaffAccess(userId: string): Promise<StaffAccess> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      staffDeactivatedAt: true,
      totpEnabledAt: true,
      staffRoles: {
        select: {
          role: { select: { key: true, permissions: { select: { permissionKey: true } } } },
        },
      },
    },
  });
  const isStaff = user?.role === "ADMIN" && !user.staffDeactivatedAt;
  if (!user || !isStaff)
    return { isStaff: false, permissions: [], roleKeys: [], totpEnabledAt: null };
  const permissions = new Set<Permission>();
  for (const r of user.staffRoles)
    for (const p of r.role.permissions)
      if (isPermission(p.permissionKey)) permissions.add(p.permissionKey);
  return {
    isStaff: true,
    permissions: [...permissions],
    roleKeys: user.staffRoles.map((r) => r.role.key),
    totpEnabledAt: user.totpEnabledAt,
  };
}

// ───────────────────────── 2FA cookie ─────────────────────────

function cookieSig(userId: string, exp: number, enabledAt: Date): string {
  return createHmac("sha256", env.AUTH_SECRET)
    .update(`2fa:${userId}:${exp}:${enabledAt.getTime()}`)
    .digest("base64url");
}

export function twoFactorCookieValue(userId: string, enabledAt: Date, now = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + TWO_FACTOR_HOURS * 3600;
  return `${userId}.${exp}.${cookieSig(userId, exp, enabledAt)}`;
}

export function twoFactorCookieValid(
  value: string | undefined,
  userId: string,
  enabledAt: Date | null,
  now = new Date(),
): boolean {
  if (!value || !enabledAt) return false;
  const [uid, expText, sig] = value.split(".");
  const exp = Number(expText);
  if (uid !== userId || !Number.isInteger(exp) || !sig) return false;
  if (exp * 1000 < now.getTime()) return false;
  const expected = Buffer.from(cookieSig(userId, exp, enabledAt));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ───────────────────────── 2FA setup and checks ─────────────────────────

/** Starts (or restarts) setup: a new secret, not active until a code from it is confirmed. */
export async function startTotpSetup(userId: string, email: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } });
  if (user?.totpEnabledAt) throw new StaffError("Two-step sign-in is already set up.");
  const secret = generateTotpSecret();
  await db.user.update({
    where: { id: userId },
    data: { totpSecret: seal(secret, env.AUTH_SECRET, TOTP_PURPOSE), totpLastStep: null },
  });
  return { secret, uri: otpauthUri(secret, email, publicEnv.NEXT_PUBLIC_SITE_NAME) };
}

function newRecoveryCodes(): string[] {
  return Array.from({ length: 8 }, () => `${randomCode(4)}-${randomCode(4)}`);
}
const recoveryHash = (code: string) => sha256(`recovery:${code.toUpperCase().replace(/\s/g, "")}`);

/** Confirms setup with a code from the app. Returns one-time recovery codes (shown once). */
export async function confirmTotpSetup(userId: string, code: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpSecret || user.totpEnabledAt) throw new StaffError("Start the setup again.");
  const step = verifyTotp(
    open(user.totpSecret, env.AUTH_SECRET, TOTP_PURPOSE),
    code,
    new Date(),
    null,
  );
  if (step === null)
    throw new StaffError("That code isn't right. Check the app's clock and try again.");
  const codes = newRecoveryCodes();
  const enabledAt = new Date();
  const res = await db.user.updateMany({
    where: { id: userId, totpEnabledAt: null },
    data: { totpEnabledAt: enabledAt, totpLastStep: step, recoveryCodes: codes.map(recoveryHash) },
  });
  if (res.count === 0) throw new StaffError("Two-step sign-in is already set up.");
  logger.info("staff.2fa_enabled", { userId });
  return { codes, enabledAt };
}

/**
 * Checks a code from the app (or a recovery code) at sign-in. Each app code works once (the
 * accepted step only moves forward, in one conditional UPDATE); each recovery code works once.
 */
export async function verifyTwoFactor(userId: string, input: string): Promise<Date> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
  });
  if (!user?.totpSecret || !user.totpEnabledAt)
    throw new StaffError("Set up two-step sign-in first.");
  const code = input.trim();

  if (/^\d{6}$/.test(code)) {
    const secret = open(user.totpSecret, env.AUTH_SECRET, TOTP_PURPOSE);
    const step = verifyTotp(secret, code, new Date(), user.totpLastStep);
    if (step === null) throw new StaffError("That code isn't right (or was already used).");
    const res = await db.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (res.count === 0) throw new StaffError("That code was already used. Wait for the next one.");
    return user.totpEnabledAt;
  }

  const hash = recoveryHash(code);
  const used = await db.$executeRaw`
    UPDATE "User" SET "recoveryCodes" = array_remove("recoveryCodes", ${hash})
     WHERE "id" = ${userId} AND ${hash} = ANY("recoveryCodes")`;
  if (used === 0) throw new StaffError("That code isn't right.");
  logger.warn("staff.recovery_code_used", { userId });
  return user.totpEnabledAt;
}

export async function recoveryCodesLeft(userId: string): Promise<number> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { recoveryCodes: true } });
  return u?.recoveryCodes.length ?? 0;
}

/** Owner (or the CLI script) clears someone's 2FA: they set it up again at next admin visit. */
export async function resetTwoFactor(targetUserId: string): Promise<void> {
  await db.user.update({
    where: { id: targetUserId },
    data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] },
  });
  logger.warn("staff.2fa_reset", { targetUserId });
}

// ───────────────────────── staff management ─────────────────────────

export async function listStaff() {
  return db.user.findMany({
    where: { OR: [{ role: "ADMIN" }, { staffDeactivatedAt: { not: null } }] },
    orderBy: [{ staffDeactivatedAt: { sort: "asc", nulls: "first" } }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      staffDeactivatedAt: true,
      totpEnabledAt: true,
      staffRoles: { select: { role: { select: { key: true, name: true } } } },
    },
  });
}

export async function listRoles() {
  return db.staffRole.findMany({
    orderBy: { createdAt: "asc" },
    include: { permissions: { select: { permissionKey: true } } },
  });
}

/**
 * Inside a transaction: locks the OWNER role row (so two owners changing each other at once
 * queue up) and refuses if `exceptUserId` is the last active owner.
 */
async function assertAnotherOwner(tx: Tx, exceptUserId: string) {
  await tx.$queryRaw`SELECT "id" FROM "StaffRole" WHERE "key" = 'OWNER' FOR UPDATE`;
  const others = await tx.userRole.count({
    where: {
      role: { key: "OWNER" },
      userId: { not: exceptUserId },
      user: { role: "ADMIN", staffDeactivatedAt: null },
    },
  });
  if (others === 0) throw new StaffError("The store must always have at least one active owner.");
}

async function isOwner(tx: Tx, userId: string) {
  return (await tx.userRole.count({ where: { userId, role: { key: "OWNER" } } })) > 0;
}

export async function setStaffRoles(targetUserId: string, roleKeys: RoleKey[], actorId: string) {
  const keys = [...new Set(roleKeys)].filter((k) => ROLE_KEYS.includes(k));
  await db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });
    if (!target || target.role !== "ADMIN") throw new StaffError("Not an active staff member.");
    if ((await isOwner(tx, targetUserId)) && !keys.includes("OWNER"))
      await assertAnotherOwner(tx, targetUserId);
    const roles = await tx.staffRole.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });
    await tx.userRole.deleteMany({ where: { userId: targetUserId } });
    await tx.userRole.createMany({
      data: roles.map((r) => ({ userId: targetUserId, roleId: r.id, assignedById: actorId })),
    });
  });
  logger.info("staff.roles_changed", { targetUserId, actorId, roles: keys });
}

export async function deactivateStaff(targetUserId: string, actorId: string) {
  if (targetUserId === actorId) throw new StaffError("You can't deactivate yourself.");
  await db.$transaction(async (tx) => {
    if (await isOwner(tx, targetUserId)) await assertAnotherOwner(tx, targetUserId);
    const res = await tx.user.updateMany({
      where: { id: targetUserId, role: "ADMIN" },
      data: { role: "CUSTOMER", staffDeactivatedAt: new Date() },
    });
    if (res.count === 0) throw new StaffError("Not an active staff member.");
  });
  logger.warn("staff.deactivated", { targetUserId, actorId });
}

export async function reactivateStaff(targetUserId: string, actorId: string) {
  const res = await db.user.updateMany({
    where: { id: targetUserId, staffDeactivatedAt: { not: null } },
    data: { role: "ADMIN", staffDeactivatedAt: null },
  });
  if (res.count === 0) throw new StaffError("Not a deactivated staff member.");
  logger.info("staff.reactivated", { targetUserId, actorId });
}

// ───────────────────────── invites ─────────────────────────

export function inviteLink(token: string): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/staff/invite?token=${encodeURIComponent(token)}`;
}

/** Creates an invite and emails the link. Returns the link too (to share if email isn't set up). */
export async function inviteStaff(emailInput: string, roleKey: RoleKey, invitedById: string) {
  const email = normaliseEmail(emailInput);
  const existing = await db.user.findUnique({
    where: { email },
    select: { role: true, staffDeactivatedAt: true },
  });
  if (existing?.role === "ADMIN") throw new StaffError("This person is already staff.");
  if (existing?.staffDeactivatedAt)
    throw new StaffError("This person was deactivated — reactivate them instead.");
  const role = await db.staffRole.findUnique({ where: { key: roleKey }, select: { id: true } });
  if (!role) throw new StaffError("Unknown role.");
  const token = randomBytes(24).toString("base64url");
  const invite = await db.$transaction(async (tx) => {
    const created = await tx.staffInvite.create({
      data: {
        email,
        roleId: role.id,
        tokenHash: sha256(token),
        invitedById,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      },
      select: { id: true },
    });
    await enqueue("email.marketing", { kind: "staff_invite", inviteId: created.id, token }, { tx });
    return created;
  });
  await kickJobs();
  logger.info("staff.invited", { inviteId: invite.id, invitedById, roleKey });
  return { inviteId: invite.id, link: inviteLink(token) };
}

export async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return db.staffInvite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { role: { select: { key: true, name: true } } },
  });
}

/** The signed-in person accepts. The invite must be for their email, unused and not expired. */
export async function acceptInvite(token: string, user: { id: string; email: string | null }) {
  const invite = await findInvite(token);
  if (!invite || invite.acceptedAt || invite.revokedAt || invite.expiresAt < new Date())
    throw new StaffError("This invitation has expired or was already used.");
  if (!user.email || normaliseEmail(user.email) !== invite.email)
    throw new StaffError(`This invitation is for ${invite.email}. Sign in with that email.`);
  await db.$transaction(async (tx) => {
    const res = await tx.staffInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date(), acceptedUserId: user.id },
    });
    if (res.count === 0) throw new StaffError("This invitation was already used.");
    await tx.user.update({
      where: { id: user.id },
      data: { role: "ADMIN", staffDeactivatedAt: null },
    });
    await tx.userRole.createMany({
      data: [{ userId: user.id, roleId: invite.roleId, assignedById: invite.invitedById }],
      skipDuplicates: true,
    });
  });
  logger.info("staff.invite_accepted", { inviteId: invite.id, userId: user.id });
  return { roleName: invite.role.name };
}

export async function listOpenInvites() {
  return db.staffInvite.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    include: { role: { select: { name: true } } },
  });
}

export async function revokeInvite(inviteId: string) {
  await db.staffInvite.updateMany({
    where: { id: inviteId, acceptedAt: null },
    data: { revokedAt: new Date() },
  });
}
