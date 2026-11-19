import { afterAll, describe, expect, it, vi } from "vitest";

/** Phase 21 — staff roles, invites and two-step sign-in against real PostgreSQL. */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const { db } = await import("@/lib/db");
const staff = await import("@/services/staff.service");
const { hotp, stepAt, totpAt } = await import("@/lib/totp");
const { ROLES } = await import("@/lib/permissions");

const RUN = `st${Date.now().toString(36)}`;
const ids: string[] = [];
let seq = 0;

async function person(roleKeys: string[] = [], admin = true) {
  const u = await db.user.create({
    data: { email: `${RUN}-${++seq}@example.com`, role: admin ? "ADMIN" : "CUSTOMER" },
  });
  ids.push(u.id);
  for (const key of roleKeys) {
    const role = await db.staffRole.findUniqueOrThrow({ where: { key } });
    await db.userRole.create({ data: { userId: u.id, roleId: role.id } });
  }
  return u;
}

/** Sets up 2FA for a person the way the pages do; returns the app secret. */
async function withTwoFactor(u: { id: string; email: string }) {
  const { secret } = await staff.startTotpSetup(u.id, u.email);
  // Use the previous step's code so the next test code (current step) is still "new".
  const prev = hotp(secret, stepAt(new Date()) - 1);
  const { codes, enabledAt } = await staff.confirmTotpSetup(u.id, prev);
  return { secret, codes, enabledAt };
}

/** Owners outside this file that a test set aside; always put back afterwards. */
const setAside: string[] = [];

afterAll(async () => {
  if (setAside.length)
    await db.user.updateMany({
      where: { id: { in: setAside } },
      data: { role: "ADMIN", staffDeactivatedAt: null },
    });
  await db.staffInvite.deleteMany({ where: { email: { startsWith: RUN } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("access", () => {
  it("permissions come from roles and change at once; customers and deactivated staff get none", async () => {
    const u = await person(["SUPPORT"]);
    expect((await staff.getStaffAccess(u.id)).permissions.sort()).toEqual(
      [...ROLES.SUPPORT.permissions].sort(),
    );
    await staff.setStaffRoles(u.id, ["ORDER_MANAGER"], "owner");
    expect((await staff.getStaffAccess(u.id)).permissions).toContain("refunds.manage");

    const c = await person(["OWNER"], false); // has a role row but isn't staff
    expect(await staff.getStaffAccess(c.id)).toMatchObject({ isStaff: false, permissions: [] });
  });

  it("deactivating removes access immediately; reactivating restores it; you can't deactivate yourself", async () => {
    const owner = await person(["OWNER"]);
    const u = await person(["MANAGER"]);
    await staff.deactivateStaff(u.id, owner.id);
    expect((await staff.getStaffAccess(u.id)).isStaff).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).role).toBe("CUSTOMER");
    await staff.reactivateStaff(u.id, owner.id);
    expect((await staff.getStaffAccess(u.id)).permissions).toContain("orders.update");
    await expect(staff.deactivateStaff(owner.id, owner.id)).rejects.toThrow(/yourself/);
  });
});

describe("the last owner", () => {
  /** Leaves exactly the given people as the store's active owners (other test owners deactivated). */
  async function onlyOwners(...owners: string[]) {
    const others = await db.user.findMany({
      where: {
        role: "ADMIN",
        staffRoles: { some: { role: { key: "OWNER" } } },
        id: { notIn: owners },
      },
      select: { id: true },
    });
    setAside.push(...others.map((o) => o.id)); // restored in afterAll
    await db.user.updateMany({
      where: {
        role: "ADMIN",
        staffRoles: { some: { role: { key: "OWNER" } } },
        id: { notIn: owners },
      },
      data: { role: "CUSTOMER", staffDeactivatedAt: new Date() },
    });
  }

  it("can't be demoted or deactivated", async () => {
    const a = await person(["OWNER"]);
    const b = await person(["MANAGER"]);
    await onlyOwners(a.id);
    await expect(staff.setStaffRoles(a.id, ["MANAGER"], b.id)).rejects.toThrow(
      /at least one active owner/,
    );
    await expect(staff.deactivateStaff(a.id, b.id)).rejects.toThrow(/at least one active owner/);
    expect((await staff.getStaffAccess(a.id)).roleKeys).toEqual(["OWNER"]);
  });

  it("two owners demoting each other at the same moment → one stays owner (8 rounds)", async () => {
    for (let round = 0; round < 8; round++) {
      const a = await person(["OWNER"]);
      const b = await person(["OWNER"]);
      await onlyOwners(a.id, b.id);
      const results = await Promise.allSettled([
        staff.setStaffRoles(b.id, ["MANAGER"], a.id),
        staff.setStaffRoles(a.id, ["MANAGER"], b.id),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const owners = await db.userRole.count({
        where: { userId: { in: [a.id, b.id] }, role: { key: "OWNER" } },
      });
      expect(owners).toBe(1);
    }
  });
});

describe("invites", () => {
  it("only the invited email can accept, only once (even at the same moment), and gets the role", async () => {
    const owner = await person(["OWNER"]);
    const email = `${RUN}-invitee@example.com`;
    const { link } = await staff.inviteStaff(email.toUpperCase(), "SUPPORT", owner.id);
    const token = new URL(link).searchParams.get("token")!;
    const other = await person([], false);
    await expect(staff.acceptInvite(token, other)).rejects.toThrow(/for .*invitee/);

    const invitee = await db.user.create({ data: { email } });
    ids.push(invitee.id);
    const runs = await Promise.allSettled([
      staff.acceptInvite(token, invitee),
      staff.acceptInvite(token, invitee),
    ]);
    expect(runs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await staff.getStaffAccess(invitee.id)).toMatchObject({
      isStaff: true,
      roleKeys: ["SUPPORT"],
    });
    await expect(staff.acceptInvite(token, invitee)).rejects.toThrow(/expired or was already used/);
    expect((await db.staffInvite.findFirstOrThrow({ where: { email } })).tokenHash).not.toContain(
      token,
    );
  });

  it("expired, cancelled or made-up invitations don't work; existing staff can't be invited again", async () => {
    const owner = await person(["OWNER"]);
    const email = `${RUN}-late@example.com`;
    const late = await db.user.create({ data: { email } });
    ids.push(late.id);
    const { link, inviteId } = await staff.inviteStaff(email, "SUPPORT", owner.id);
    const token = new URL(link).searchParams.get("token")!;
    await db.staffInvite.update({
      where: { id: inviteId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(staff.acceptInvite(token, late)).rejects.toThrow(/expired/);

    const second = await staff.inviteStaff(email, "SUPPORT", owner.id);
    await staff.revokeInvite(second.inviteId);
    await expect(
      staff.acceptInvite(new URL(second.link).searchParams.get("token")!, late),
    ).rejects.toThrow(/expired/);
    await expect(staff.acceptInvite("x".repeat(32), late)).rejects.toThrow(/expired/);
    await expect(staff.inviteStaff(owner.email, "SUPPORT", owner.id)).rejects.toThrow(
      /already staff/,
    );
  });
});

describe("two-step sign-in", () => {
  it("the stored secret is encrypted; setup needs a correct code; then can't be restarted", async () => {
    const u = await person(["SUPPORT"]);
    const { secret } = await staff.startTotpSetup(u.id, u.email);
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.totpSecret).not.toContain(secret);
    await expect(staff.confirmTotpSetup(u.id, "000000")).rejects.toThrow(/isn't right/);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).totpEnabledAt).toBeNull();
    const { codes } = await staff.confirmTotpSetup(u.id, totpAt(secret, new Date()));
    expect(codes).toHaveLength(8);
    await expect(staff.startTotpSetup(u.id, u.email)).rejects.toThrow(/already set up/);
  });

  it("an app code works once — even when sent twice at the same moment", async () => {
    const u = await person(["SUPPORT"]);
    const { secret } = await withTwoFactor(u);
    const code = totpAt(secret, new Date());
    const results = await Promise.allSettled([
      staff.verifyTwoFactor(u.id, code),
      staff.verifyTwoFactor(u.id, code),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(staff.verifyTwoFactor(u.id, code)).rejects.toThrow();
    await expect(staff.verifyTwoFactor(u.id, "123456")).rejects.toThrow();
  });

  it("each recovery code works once (in any letter case), even in parallel", async () => {
    const u = await person(["SUPPORT"]);
    const { codes } = await withTwoFactor(u);
    const code = codes[0]!.toLowerCase();
    const results = await Promise.allSettled([
      staff.verifyTwoFactor(u.id, code),
      staff.verifyTwoFactor(u.id, code),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await staff.recoveryCodesLeft(u.id)).toBe(7);
    await expect(staff.verifyTwoFactor(u.id, "AAAA-BBBB")).rejects.toThrow();
  });

  it("the 2FA cookie: valid for its owner only, expires, can't be forged, and dies on reset", async () => {
    const u = await person(["SUPPORT"]);
    const other = await person(["SUPPORT"]);
    const { enabledAt } = await withTwoFactor(u);
    const cookie = staff.twoFactorCookieValue(u.id, enabledAt);
    expect(staff.twoFactorCookieValid(cookie, u.id, enabledAt)).toBe(true);
    expect(staff.twoFactorCookieValid(cookie, other.id, enabledAt)).toBe(false);
    expect(staff.twoFactorCookieValid(`${cookie}x`, u.id, enabledAt)).toBe(false);
    expect(staff.twoFactorCookieValid(undefined, u.id, enabledAt)).toBe(false);
    const [, exp] = cookie.split(".");
    expect(
      staff.twoFactorCookieValid(cookie.replace(exp!, String(Number(exp) + 3600)), u.id, enabledAt),
    ).toBe(false);
    expect(
      staff.twoFactorCookieValid(cookie, u.id, enabledAt, new Date(Date.now() + 13 * 3600_000)),
    ).toBe(false);

    await staff.resetTwoFactor(u.id);
    const after = await staff.getStaffAccess(u.id);
    expect(staff.twoFactorCookieValid(cookie, u.id, after.totpEnabledAt)).toBe(false);
    const again = await withTwoFactor(u); // set up again → old cookie still dead
    expect(staff.twoFactorCookieValid(cookie, u.id, again.enabledAt)).toBe(false);
  });
});
