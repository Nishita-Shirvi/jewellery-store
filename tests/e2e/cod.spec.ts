import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createVariantRing, pickOption, uniqueSlug, hideTestProducts } from "./fixtures";

/**
 * Phase 18 "done when": a COD order goes placed → shipped → delivered → paid, and COD is blocked
 * where the rules say so. SMS codes go to the stand-in in tests/e2e/mock-services.mjs.
 */

const db = new PrismaClient();
test.afterAll(async () => {
  await hideTestProducts(db);
  await db.$disconnect();
});

async function registerAndAddAddress(page: Page, name: string, mobile: string) {
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill(name);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`cod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await page.getByLabel("Confirm password").fill("Playwright2026");
  await page.getByRole("button", { name: "Create account" }).click();
  // Password hashing + sign-in can be slow while other browser tests run in parallel.
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Mobile number").fill(mobile);
  await page.getByLabel("House / flat, street").fill("7 Test Street");
  await page.getByLabel("City").fill("Hyderabad");
  await page.getByLabel("State").selectOption("Telangana");
  await page.getByLabel("Pincode").fill("500001");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("radio", { name: new RegExp(name) })).toBeChecked();
}

test("cash on delivery: placed with an SMS code → shipped → delivered → cash recorded", async ({
  page,
  request,
}) => {
  const mobile = `98${String(Date.now()).slice(-8)}`;
  // Its own cheap piece (₹2,200), so no other test or cached page can change its stock.
  const category = await db.category.findFirstOrThrow({ where: { slug: "earrings" } });
  const slug = uniqueSlug("e2e-cod-hoops");
  await db.product.create({
    data: {
      name: `E2E COD Hoops ${slug.slice(-4)}`,
      slug,
      description: "Made by the COD browser test.",
      priceInPaise: 220_000,
      stock: 5,
      images: ["/images/products/everyday-hoop-earrings.svg"],
      categoryId: category.id,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 4000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: 220_000,
          stock: 5,
          netWeightMg: 4000,
          images: [],
        },
      },
    },
  });
  await page.goto(`/products/${slug}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await page.goto("/cart");
  await registerAndAddAddress(page, "Cod Buyer", mobile);

  await page.getByRole("radio", { name: "Cash on delivery" }).check();
  await expect(page.getByTestId("cod-total")).toContainText("₹2,200");
  await page.getByRole("button", { name: "Send code to my mobile" }).click();
  const codeInput = page.getByLabel(/Code sent to/);
  await expect(codeInput).toBeVisible();

  // Wrong code first: refused, no order.
  await codeInput.fill("000000");
  const sms = await (
    await request.get(`http://localhost:4010/test/last-sms-code?mobile=91${mobile}`)
  ).json();
  if (sms.code === "000000") test.skip(true, "random code happened to be 000000");
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByText(/isn't right/)).toBeVisible();

  await codeInput.fill(sms.code);
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/[a-z0-9]+\/success$/, { timeout: 20_000 });
  await expect(page.getByTestId("cod-note")).toContainText("₹2,200");
  const orderId = /\/orders\/([a-z0-9]+)\/success/.exec(page.url())![1]!;
  await expect(page.getByRole("link", { name: /Cart, 0 items/ })).toBeVisible();

  const placed = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(placed).toMatchObject({ status: "CONFIRMED", paymentMethod: "COD", paidAt: null });

  // Admin: ship, deliver, record the cash.
  const adminEmail = `e2e-cod-admin-${Date.now()}@example.com`;
  await db.user.create({
    data: {
      email: adminEmail,
      role: "ADMIN",
      passwordHash: await bcrypt.hash("E2eAdminPass2026", 10),
    },
  });
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(adminEmail);
  await page.getByLabel("Password").fill("E2eAdminPass2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByTestId("cod-state")).toHaveText(/To collect at delivery/);
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await page.getByRole("button", { name: "Mark as delivered" }).click();
  await expect(page.getByTestId("cod-state")).toHaveText(/waiting for the courier/);

  await page.goto("/admin/cod");
  await page
    .getByRole("checkbox", { name: new RegExp(`#${orderId.slice(-8).toUpperCase()}`) })
    .check();
  await page.getByLabel("Remittance reference (optional)").fill("SR-REMIT-1");
  await page.getByRole("button", { name: "Record cash received" }).click();
  await expect(page.getByRole("status")).toContainText("Recorded cash for 1 order(s).");

  const paid = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true },
  });
  expect(paid.status).toBe("DELIVERED");
  expect(paid.paidAt).not.toBeNull();
  expect(paid.payments).toHaveLength(1);
  expect(paid.payments[0]).toMatchObject({
    provider: "COD",
    status: "CAPTURED",
    amountInPaise: 220000,
  });

  await page.goto("/admin/reports");
  await expect(page.getByTestId("method-cod")).toBeVisible();
});

test("COD is refused above the limit, with the reason shown", async ({ page }) => {
  const ring = await createVariantRing(db); // ₹30,000 for size 12 — far above the ₹10,000 COD limit
  await page.goto(`/products/${ring.slug}`);
  await page.waitForLoadState("networkidle");
  await pickOption(page, "Ring size", "12");
  await pickOption(page, "Metal colour", "Yellow");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await page.goto("/cart");
  await registerAndAddAddress(page, "Big Buyer", `97${String(Date.now()).slice(-8)}`);

  await page.getByRole("radio", { name: "Cash on delivery" }).check();
  await expect(page.getByTestId("cod-unavailable")).toContainText("up to ₹10,000");
  await expect(page.getByRole("button", { name: "Send code to my mobile" })).toHaveCount(0);
});
