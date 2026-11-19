import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Gold rates, showroom settings and visit requests (app/admin/storefront-actions.ts) follow the
 * same rules as every admin action: signed in, staff, two-step sign-in passed and the right
 * permission — checked on the server before any data is touched — and written to the activity log.
 */

const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; role: string; email: string } },
}));
const access = vi.hoisted(() => ({
  current: {
    isStaff: false,
    permissions: [] as string[],
    roleKeys: [] as string[],
    totpEnabledAt: null as Date | null,
  },
}));
const twoFA = vi.hoisted(() => ({ passed: true }));
const touched = vi.hoisted(() => [] as string[]);
const auditMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "signed-2fa-cookie" }), set: vi.fn() }),
}));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
vi.mock("@/services/audit.service", () => ({ audit: auditMock, diff: () => ({}) }));
vi.mock("@/services/staff.service", () => ({
  TWO_FACTOR_COOKIE: "staff_2fa",
  getStaffAccess: async () => access.current,
  twoFactorCookieValid: () => twoFA.passed,
}));
vi.mock("@/services/metal-rate.service", () => ({
  RateError: class extends Error {},
  saveRates: vi.fn(async () => {
    touched.push("saveRates");
    return { saved: ["K22"], repriced: 0, changes: { K22: { from: null, to: 725000 } } };
  }),
}));
vi.mock("@/services/storefront.service", () => ({
  saveStorefrontSettings: vi.fn(async () => void touched.push("saveStorefrontSettings")),
}));
vi.mock("@/services/visit.service", () => ({
  VisitError: class extends Error {},
  updateVisitStatus: vi.fn(async () => {
    touched.push("updateVisitStatus");
    return { name: "Asha", before: "NEW" };
  }),
}));

const actions = await import("@/app/admin/storefront-actions");
const { ForbiddenError, UnauthorizedError } = await import("@/lib/auth-guards");

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const CASES: Record<string, { needs: Permission; run: () => Promise<unknown> }> = {
  saveRatesAction: {
    needs: "products.edit",
    run: () => actions.saveRatesAction({}, form({ K22: "7250", confirmLarge: "on" })),
  },
  saveStorefrontSettingsAction: {
    needs: "content.manage",
    run: () => actions.saveStorefrontSettingsAction({}, form({ hours: "10 am – 7 pm" })),
  },
  updateVisitStatusAction: {
    needs: "support.manage",
    run: () => actions.updateVisitStatusAction(form({ id: "abc123", status: "CONFIRMED" })),
  },
};
const names = Object.keys(CASES);

function signedInAs(perms: readonly string[], opts: { staff?: boolean; twoFA?: boolean } = {}) {
  session.current = { user: { id: "u1", role: "ADMIN", email: "staff@example.com" } };
  access.current = {
    isStaff: opts.staff ?? true,
    permissions: [...perms],
    roleKeys: [],
    totpEnabledAt: new Date(),
  };
  twoFA.passed = opts.twoFA ?? true;
}

describe("gold rate, showroom and visit actions are protected on the server", () => {
  beforeEach(() => {
    touched.length = 0;
    auditMock.mockClear();
  });

  it("covers every exported action", () => {
    expect(Object.keys(actions).sort()).toEqual([...names].sort());
  });

  it.each(names)("%s → 401 for a guest", async (name) => {
    session.current = null;
    await expect(CASES[name]!.run()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → 403 for a customer", async (name) => {
    signedInAs(ALL_PERMISSIONS, { staff: false });
    await expect(CASES[name]!.run()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → 403 before two-step sign-in", async (name) => {
    signedInAs(ALL_PERMISSIONS, { twoFA: false });
    await expect(CASES[name]!.run()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → 403 with every permission except the one it needs", async (name) => {
    signedInAs(ALL_PERMISSIONS.filter((p) => p !== CASES[name]!.needs));
    await expect(CASES[name]!.run()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → works with just its permission and is logged", async (name) => {
    signedInAs([CASES[name]!.needs]);
    await CASES[name]!.run();
    expect(touched.length).toBe(1);
    expect(
      auditMock.mock.calls.some(([, e]) => (e as { action: string }).action !== "auth.denied"),
    ).toBe(true);
  });
});
