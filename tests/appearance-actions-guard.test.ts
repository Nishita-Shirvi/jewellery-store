import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { EVERYDAY_THEME } from "@/lib/appearance";

/**
 * Admin → Appearance actions follow the same rules as every admin action: signed in, staff,
 * two-step sign-in passed and "content.manage" — checked on the server before anything is
 * read or saved — and written to the activity log.
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
vi.mock("@/services/appearance.service", async () => {
  const { DEFAULT_APPEARANCE } = await import("@/lib/appearance");
  return {
    loadAppearance: vi.fn(async () => {
      touched.push("loadAppearance");
      return structuredClone(DEFAULT_APPEARANCE);
    }),
    saveAppearance: vi.fn(async (value: unknown) => {
      touched.push("saveAppearance");
      stored.value = value;
    }),
  };
});
vi.mock("@/services/upload.service", () => ({
  UploadError: class extends Error {},
  isUploadConfigured: () => true,
  uploadImage: vi.fn(async () => {
    touched.push("uploadImage");
    return "https://res.cloudinary.com/demo/image/upload/x.jpg";
  }),
}));

const actions = await import("@/app/admin/appearance-actions");
const { ForbiddenError, UnauthorizedError } = await import("@/lib/auth-guards");

function fileForm() {
  const fd = new FormData();
  fd.append(
    "file",
    new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" }),
  );
  return fd;
}

const newTheme = {
  ...EVERYDAY_THEME,
  id: "new-1",
  name: "Diwali",
  isDefault: true, // must be ignored: only the existing Everyday theme is the default
  from: "2026-11-01",
  until: "2026-11-12",
};

const CASES: Record<string, () => Promise<unknown>> = {
  saveThemeAction: () => actions.saveThemeAction(newTheme),
  deleteThemeAction: () => actions.deleteThemeAction("everyday"),
  saveDefaultModeAction: () => actions.saveDefaultModeAction("dark"),
  uploadAppearanceImageAction: () => actions.uploadAppearanceImageAction(fileForm()),
  videoUploadTicketAction: () => actions.videoUploadTicketAction(),
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

describe("Admin → Appearance actions are protected on the server", () => {
  beforeEach(() => {
    touched.length = 0;
    auditMock.mockClear();
  });

  it("covers every exported action", () => {
    expect(Object.keys(actions).sort()).toEqual([...names].sort());
  });

  it.each(names)("%s → 401 for a guest", async (name) => {
    session.current = null;
    await expect(CASES[name]!()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → 403 for a customer", async (name) => {
    signedInAs(ALL_PERMISSIONS, { staff: false });
    await expect(CASES[name]!()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → 403 before two-step sign-in", async (name) => {
    signedInAs(ALL_PERMISSIONS, { twoFA: false });
    await expect(CASES[name]!()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → 403 without content.manage", async (name) => {
    signedInAs(ALL_PERMISSIONS.filter((p) => p !== "content.manage"));
    await expect(CASES[name]!()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it("saves a new festival theme as a dated theme and logs it", async () => {
    signedInAs(["content.manage"]);
    const res = await actions.saveThemeAction(newTheme);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const added = res.appearance.themes.find((t) => t.id === res.savedId)!;
    expect(added.isDefault).toBe(false);
    expect(added.id).toMatch(/^diwali-[0-9a-f]{6}$/);
    expect(res.appearance.themes.filter((t) => t.isDefault)).toHaveLength(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("never deletes the Everyday theme", async () => {
    signedInAs(["content.manage"]);
    const res = await actions.deleteThemeAction("everyday");
    expect(res.ok).toBe(false);
    expect(touched).not.toContain("saveAppearance");
  });

  it("returns field errors instead of saving bad input", async () => {
    signedInAs(["content.manage"]);
    const res = await actions.saveThemeAction({
      ...newTheme,
      hero: { ...newTheme.hero, ctaHref: "https://evil.example" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.fieldErrors?.["hero.ctaHref"]).toBeTruthy();
    expect(touched).not.toContain("saveAppearance");
  });
});
