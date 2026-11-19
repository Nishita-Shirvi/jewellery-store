import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createStaff, staffLogin, uniqueSlug, visitorIp } from "./fixtures";

/**
 * Kill switch (Phase 30) in the browser: the owner pauses checkout on Admin → System, a
 * customer with a full cart sees "Checkout is paused" instead of payment options, and checkout
 * comes back the moment it's turned on again.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.appSetting.deleteMany({ where: { key: "switches" } });
  await db.$disconnect();
});

test("owner pauses checkout; the customer sees it paused; turned back on, it works", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
  const slug = uniqueSlug("e2e-switch");
  await db.product.create({
    data: {
      name: "Switch Test Ring",
      slug,
      description: "Made by the kill-switch browser test.",
      priceInPaise: 250_000,
      stock: 5,
      images: ["/images/products/floral-band-ring.svg"],
      categoryId: category.id,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 3000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: 250_000,
          stock: 5,
          netWeightMg: 3000,
          images: [],
        },
      },
    },
  });

  // The owner pauses checkout.
  const ownerCtx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("switch-owner") },
  });
  const owner = await ownerCtx.newPage();
  await staffLogin(owner, await createStaff(db, ["OWNER"]), "/admin/system");
  const row = owner.getByTestId("switch-checkout");
  await row.getByLabel(/Reason for pausing/).fill("price check");
  await row.getByRole("button", { name: /Pause Checkout/ }).click();
  await expect(row).toContainText("Paused");
  await expect(row).toContainText("price check");

  // A customer with a full cart can't pay, and is told why.
  await page.goto(`/products/${slug}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Switch Tester");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-switch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await page.getByLabel("Confirm password").fill("Playwright2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 20_000 });
  await expect(page.getByTestId("checkout-paused")).toContainText("Checkout is paused");
  await expect(page.getByRole("button", { name: /^Pay / })).toHaveCount(0);

  // Turned back on → the payment step is back (within the few-second cache).
  await row.getByRole("button", { name: /Turn on Checkout/ }).click();
  await expect(row).toContainText("On");
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByTestId("checkout-paused").count();
      },
      { timeout: 20_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(0);
  await expect(page.getByLabel("Full name")).toBeVisible();
  await ownerCtx.close();
});
