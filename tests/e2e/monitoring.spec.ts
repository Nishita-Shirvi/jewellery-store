import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createStaff, hideTestProducts, staffLogin, uniqueSlug, visitorIp } from "./fixtures";

/**
 * Phase 26 "done when": a simulated payment outage alerts within 5 minutes.
 * The Razorpay stand-in fails orders of one unusual amount (₹13,131), so only this test's
 * checkouts hit the "outage"; every attempt is a real click on Pay.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
const OUTAGE_AMOUNT = 13_13_100; // ₹13,131 in paise

test.afterAll(async () => {
  await fetch("http://localhost:4010/test/razorpay-outage?amount=", { method: "POST" });
  await hideTestProducts(db);
  await db.$disconnect();
});

test("payment outage: failures at checkout raise the alert within 5 minutes", async ({
  page,
  browser,
}) => {
  // Clean slate for this alert (earlier runs may have left it firing).
  await db.alertState.deleteMany({ where: { key: "payments" } });
  await db.metric.deleteMany({ where: { key: "payments.gateway_error" } });
  await fetch(`http://localhost:4010/test/razorpay-outage?amount=${OUTAGE_AMOUNT}`, {
    method: "POST",
  });

  const category = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const slug = uniqueSlug("e2e-outage-ring");
  await db.product.create({
    data: {
      name: `Outage Ring ${slug.slice(-4)}`,
      slug,
      description: "Made by the monitoring browser test.",
      priceInPaise: OUTAGE_AMOUNT,
      stock: 20,
      images: ["/images/products/floral-band-ring.svg"],
      categoryId: category.id,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 3000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: OUTAGE_AMOUNT,
          stock: 20,
          netWeightMg: 3000,
          images: [],
        },
      },
    },
  });

  // A customer reaches checkout.
  await page.goto(`/products/${slug}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Outage Tester");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-outage-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await page.getByLabel("Confirm password").fill("Playwright2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Outage Tester");
  await page.getByLabel("Mobile number").fill("9876501299");
  await page.getByLabel("House / flat, street").fill("13 Test Street");
  await page.getByLabel("City").fill("Hyderabad");
  await page.getByLabel("State").selectOption("Telangana");
  await page.getByLabel("Pincode").fill("500001");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("radio", { name: /Outage Tester/ })).toBeChecked();

  // Attempts to pay while the gateway is "down" (each visit is a new checkout). At least five;
  // more if other tests' successful payments in the last 15 minutes keep the failure rate
  // under the alert threshold (the alert is a rate, not a count).
  const firstFailure = Date.now();
  const firing = async () =>
    (await db.alertState.findUnique({ where: { key: "payments" } }))?.firing === true;
  for (let i = 0; i < 20; i++) {
    if (i > 0) {
      await page.reload();
      await page.waitForLoadState("networkidle");
    }
    await page.getByRole("button", { name: "Pay ₹13,131" }).click();
    await expect(page.getByText("We couldn't reach the payment provider")).toBeVisible();
    if (i >= 4 && (await firing())) break;
  }

  // The alert is firing — checked as the failures happened, not at the next cron run.
  await expect
    .poll(async () => (await db.alertState.findUnique({ where: { key: "payments" } }))?.firing, {
      timeout: 60_000,
    })
    .toBe(true);
  const firedAfterMs = Date.now() - firstFailure;
  expect(firedAfterMs).toBeLessThan(5 * 60_000);
  const notify = await db.job.findFirst({
    where: { type: "alerts.notify", createdAt: { gte: new Date(firstFailure) } },
    orderBy: { createdAt: "desc" },
  });
  expect(notify).not.toBeNull();

  // The owner sees it on Admin → System.
  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("monitoring-owner") },
  });
  const owner = await ctx.newPage();
  await staffLogin(owner, await createStaff(db, ["OWNER"]), "/admin/system");
  const row = owner.getByTestId("alert-payments");
  await expect(row).toContainText("Firing since");
  await expect(row).toContainText(/\d+ gateway error\(s\)/);
  await expect(owner.getByTestId("health-db")).toContainText("OK");
  await ctx.close();
});
