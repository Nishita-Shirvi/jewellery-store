import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_ENTRANCE } from "@/lib/entrance";

/**
 * Admin → Appearance → Sign-in & top bar follows the same rules as every admin action: signed in, staff,
 * two-step sign-in passed and "content.manage", checked before anything is saved, and logged.
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
const stored = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: {
    AUTH_SECRET: "test-secret-0123456789abcdefghijklmnopqrstuv",
    CLOUDINARY_API_BASE: "https://api.cloudinary.com",
    CLOUDINARY_CLOUD_NAME: "demo",
    CLOUDINARY_API_KEY: "key",
    CLOUDINARY_API_SECRET: "secret",
  },
}));
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
vi.mock("@/services/entrance.service", () => ({
  saveEntrance: vi.fn(async (value: unknown) => {
    touched.push("saveEntrance");
    stored.value = value;
  }),
}));

const actions = await import("@/app/admin/entrance-actions");
const { ForbiddenError, UnauthorizedError } = await import("@/lib/auth-guards");

const run = () => actions.saveEntranceAction(DEFAULT_ENTRANCE);

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

describe("Admin → Appearance → Sign-in & top bar is protected on the server", () => {
  beforeEach(() => {
    touched.length = 0;
    auditMock.mockClear();
  });

  it("covers every exported action", () => {
    expect(Object.keys(actions)).toEqual(["saveEntranceAction"]);
  });

  it("401 for a guest", async () => {
    session.current = null;
    await expect(run()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(touched).toEqual([]);
  });

  it("403 for a customer, before two-step sign-in, or without content.manage", async () => {
    for (const setup of [
      () => signedInAs(ALL_PERMISSIONS, { staff: false }),
      () => signedInAs(ALL_PERMISSIONS, { twoFA: false }),
      () => signedInAs(ALL_PERMISSIONS.filter((p) => p !== "content.manage")),
    ]) {
      setup();
      await expect(run()).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(touched).toEqual([]);
  });

  it("saves with content.manage and logs it", async () => {
    signedInAs(["content.manage"]);
    const res = await run();
    expect(res.ok).toBe(true);
    expect(touched).toEqual(["saveEntrance"]);
    expect(stored.value).toEqual(DEFAULT_ENTRANCE);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a video from another website", async () => {
    signedInAs(["content.manage"]);
    const res = await actions.saveEntranceAction({
      ...DEFAULT_ENTRANCE,
      videoUrl: "https://evil.example/clip.mp4",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.fieldErrors?.videoUrl).toBeTruthy();
    expect(touched).toEqual([]);
  });
});
