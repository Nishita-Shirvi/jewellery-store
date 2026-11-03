import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { visitorIp, watchCsp } from "./fixtures";

/** Phase 23: CSP, open-redirect fix, password reset, installable app (PWA) with offline page. */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

async function customer() {
  const email = `e2e-sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await db.user.create({
    data: { email, name: "Sec Tester", passwordHash: await bcrypt.hash("Original2026", 10) },
  });
  return email;
}

test("every page sends the CSP and the main pages break no rule", async ({ page }) => {
  const csp = watchCsp(page);
  for (const path of ["/", "/products", "/help", "/login", "/register", "/forgot-password"]) {
    const res = await page.goto(path);
    const header = res!.headers()["content-security-policy"] ?? "";
    expect(header).toContain("frame-ancestors 'none'");
    expect(header).toContain("object-src 'none'");
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/products");
  await page.getByRole("link").filter({ hasText: /₹/ }).first().click();
  await page.waitForLoadState("networkidle");
  expect(csp).toEqual([]);
});

test("login can't be used to bounce people to another site (tab trick)", async ({ page }) => {
  const email = await customer();
  await page.goto("/login?callbackUrl=/%09/evil.com");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill("Original2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host);
  // Already signed in: the login page redirects straight away — still on this site.
  await page.goto("/login?callbackUrl=/%09/evil.com");
  expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host);
});

test("forgot password: same answer for any email; the link works once and the old password stops", async ({
  page,
}) => {
  const email = await customer();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await page.waitForURL(/\/forgot-password$/);
  await page.getByLabel("Email", { exact: true }).fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  const neutral = await page.getByRole("main").getByRole("status").innerText();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("main").getByRole("status")).toHaveText(neutral);

  // The message was already showing from the first request, so wait for the server to have
  // stored this one — otherwise it could land after our link below and (rightly) cancel it.
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await expect
    .poll(() => db.passwordResetToken.count({ where: { userId: user.id } }))
    .toBeGreaterThan(0);
  // The emailed link (emails aren't sent in tests) — made the same way the app makes it.
  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  await page.goto(`/reset-password?token=${token}`);
  await page.waitForLoadState("networkidle"); // form ready before typing
  await page.getByLabel("New password", { exact: true }).fill("Changed2026");
  await page.getByLabel("Confirm new password").fill("Changed2026");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "password has been changed",
  );

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill("Original2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Incorrect");
  await page.getByLabel("Password").fill("Changed2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/account/);

  await page.goto(`/reset-password?token=${token}`); // used
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "expired or was already used",
  );
});

test("installable: manifest and icons; offline navigation shows the offline page", async ({
  page,
  context,
}) => {
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const i of manifest.icons)
    expect((await page.request.get(i.src)).headers()["content-type"]).toBe("image/png");

  await page.goto("/");
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return Boolean(reg?.active);
  });
  await page.reload(); // now controlled by the service worker
  await context.setOffline(true);
  await page.goto("/products").catch(() => null);
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
