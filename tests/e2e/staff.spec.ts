import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { totpAt } from "@/lib/totp";
import { createStaff, hideTestProducts, staffLogin, uniqueSlug, visitorIp } from "./fixtures";

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

/**
 * Phase 21 "done when": a SUPPORT user can view orders but gets 403 on refunds and product
 * edits — even by calling the server directly — and staff two-step sign-in is enforced.
 */

const db = new PrismaClient();
test.afterAll(async () => {
  await hideTestProducts(db);
  await db.$disconnect();
});

test("first admin visit forces two-step setup; recovery codes shown once", async ({ page }) => {
  const owner = await createStaff(db, ["OWNER"], { twoFactor: false });
  await staffLogin(page, owner, "/admin/orders"); // lands on /staff/2fa (not set up)

  // No way round it: the admin pages and APIs refuse until it's done.
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/staff\/2fa/);
  expect((await page.request.get("/api/admin/me")).status()).toBe(403);

  await page.getByRole("button", { name: "Set up two-step sign-in" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code from the app").fill("000000");
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("isn't right");
  await page.getByLabel("6-digit code from the app").fill(totpAt(secret, new Date()));
  await page.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await expect(page.getByTestId("recovery-codes").getByRole("listitem")).toHaveCount(8);
  await page.getByRole("button", { name: /saved them/ }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  expect((await page.request.get("/api/admin/me")).status()).toBe(200);
});

test("SUPPORT can look at orders and products, nothing more — pages, menu and direct calls", async ({
  page,
}) => {
  const category = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const slug = uniqueSlug("e2e-support");
  const product = await db.product.create({
    data: {
      name: "Support Test Ring",
      slug,
      description: "Made by the staff browser test.",
      priceInPaise: 100_000,
      stock: 1,
      images: [],
      categoryId: category.id,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 1000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: 100_000,
          stock: 1,
          netWeightMg: 1000,
          images: [],
        },
      },
    },
  });
  const support = await createStaff(db, ["SUPPORT"]);
  await staffLogin(page, support, "/admin/orders");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Products" })).toBeVisible();
  for (const hidden of ["Staff", "Coupons", "Reports", "Jobs", "Cash on delivery"])
    await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);

  await page.goto("/admin/products");
  await expect(page.getByRole("heading", { name: /Products/ })).toBeVisible();
  for (const path of [
    `/admin/products/${product.id}`,
    "/admin/staff",
    "/admin/coupons",
    "/admin/reports",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/forbidden/);
  }
  // Direct API call that needs reports.view.
  expect((await page.request.get("/api/admin/orders/export")).status()).toBe(403);

  // The refused attempts are in the activity log.
  const denied = await db.auditLog.count({ where: { actorId: support.id, action: "auth.denied" } });
  expect(denied).toBeGreaterThanOrEqual(5);
});

test("owner invites a new person; they register, accept and set up two-step sign-in", async ({
  page,
  browser,
}) => {
  const owner = await createStaff(db, ["OWNER"]);
  await staffLogin(page, owner, "/admin/staff");
  const email = `e2e-invitee-${Date.now()}@example.com`;
  const form = page.getByRole("form", { name: "Invite staff" });
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Role").selectOption("CATALOG_EDITOR");
  await form.getByRole("button", { name: "Send invitation" }).click();
  const result = await page.getByTestId("invite-result").innerText();
  const link = /(http\S+\/staff\/invite\?token=\S+)/.exec(result)![1]!;

  // The invitee, in their own browser.
  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("invitee browser") },
  });
  const p2 = await ctx.newPage();
  await p2.goto(new URL(link).pathname + new URL(link).search);
  await p2.getByRole("link", { name: "Create an account" }).click();
  await p2.getByLabel("Full name").fill("New Editor");
  await p2.getByLabel("Email", { exact: true }).fill(email);
  await p2.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await p2.getByLabel("Confirm password").fill("Playwright2026");
  await p2.getByRole("button", { name: "Create account" }).click();
  await p2.waitForURL(/\/staff\/invite/, { timeout: 20_000 });
  await p2.getByRole("button", { name: "Accept invitation" }).click();
  await p2.waitForURL(/\/staff\/2fa/);
  await p2.getByRole("button", { name: "Set up two-step sign-in" }).click();
  const secret = (await p2.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  await p2.getByLabel("6-digit code from the app").fill(totpAt(secret, new Date()));
  await p2.getByRole("button", { name: "Turn on two-step sign-in" }).click();
  await p2.getByRole("button", { name: /saved them/ }).click();
  await p2.waitForURL(/\/admin$/);
  const nav = p2.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Products" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Orders" })).toHaveCount(0);
  await ctx.close();

  // The owner sees them in the team list.
  await page.reload();
  await expect(page.getByTestId("staff-row").filter({ hasText: email })).toContainText(
    "two-step sign-in on",
  );
});
