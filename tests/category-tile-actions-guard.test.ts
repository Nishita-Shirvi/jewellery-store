import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { sampleTile } from "@/lib/tiles";

/**
 * Admin → Categories → Tile actions follow the same rules as every admin action: signed in,
 * staff, two-step sign-in passed and "products.edit", checked before anything is saved or
 * uploaded, and written to the activity log.
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
vi.mock("@/services/admin/category-admin.service", () => ({
  saveCategoryTile: vi.fn(async () => void touched.push("saveCategoryTile")),
}));
vi.mock("@/services/admin/product-admin.service", () => ({
  AdminInputError: class extends Error {},
}));
vi.mock("@/services/upload.service", () => ({
  UploadError: class extends Error {},
  uploadImage: vi.fn(async () => {
    touched.push("uploadImage");
    return "https://res.cloudinary.com/demo/image/upload/x.png";
  }),
}));

const actions = await import("@/app/admin/category-tile-actions");
const { ForbiddenError, UnauthorizedError } = await import("@/lib/auth-guards");

function fileForm() {
  const fd = new FormData();
  fd.append(
    "file",
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "a.png", { type: "image/png" }),
  );
  return fd;
}

const tile = sampleTile({ slug: "rings", name: "Rings" });
const CASES: Record<string, () => Promise<unknown>> = {
  saveCategoryTileAction: () => actions.saveCategoryTileAction("cat1", tile, "Rings"),
  uploadTileImageAction: () => actions.uploadTileImageAction(fileForm()),
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

describe("Admin → Categories → Tile actions are protected on the server", () => {
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

  it.each(names)("%s → 403 without products.edit", async (name) => {
    signedInAs(ALL_PERMISSIONS.filter((p) => p !== "products.edit"));
    await expect(CASES[name]!()).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toEqual([]);
  });

  it.each(names)("%s → works with products.edit and is logged", async (name) => {
    signedInAs(["products.edit"]);
    await CASES[name]!();
    expect(touched.length).toBe(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a tile with a picture from another website", async () => {
    signedInAs(["products.edit"]);
    const res = await actions.saveCategoryTileAction("cat1", {
      ...tile,
      piece: "https://evil.example/p.png",
    });
    expect(res.ok).toBe(false);
    expect(touched).toEqual([]);
  });

  it("resets to the sample tile with null", async () => {
    signedInAs(["products.edit"]);
    const res = await actions.saveCategoryTileAction("cat1", null);
    expect(res).toEqual({ ok: true, tile: null });
  });
});
