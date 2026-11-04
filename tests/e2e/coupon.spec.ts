import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hideTestProducts, uniqueSlug, visitorIp } from "./fixtures";

/** Week 3 release: coupons end to end — apply at checkout, pay, discount on the order, limit held. */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await hideTestProducts(db);
  await db.$disconnect();
});

const FAKE_RAZORPAY = `
window.Razorpay = function (o) {
  this.on = function () {};
  this.open = function () {
    var p = "pay_" + Math.random().toString(36).slice(2, 12);
    fetch("http://localhost:4010/sign?o=" + o.order_id + "&p=" + p)
      .then(function (r) { return r.json(); })
      .then(function (j) { o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: p, razorpay_signature: j.sig }); });
  };
};`;

async function buyerReachesCheckout(page: Page, slug: string, name: string) {
  await page.goto(`/products/${slug}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill(name);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-coupon-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await page.getByLabel("Confirm password").fill("Playwright2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Mobile number").fill("9876501234");
  await page.getByLabel("House / flat, street").fill("7 Test Street");
  await page.getByLabel("City").fill("Hyderabad");
  await page.getByLabel("State").selectOption("Telangana");
  await page.getByLabel("Pincode").fill("500001");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("radio", { name: new RegExp(name) })).toBeChecked();
}

test("10% coupon: applied at checkout, paid, saved on the order; its single use can't be reused", async ({
  page,
  browser,
}) => {
  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_RAZORPAY }),
  );
  const category = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const slug = uniqueSlug("e2e-coupon-ring");
  await db.product.create({
    data: {
      name: `Coupon Ring ${slug.slice(-4)}`,
      slug,
      description: "Made by the coupon browser test.",
      priceInPaise: 500_000, // ₹5,000 → free shipping
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
          priceInPaise: 500_000,
          stock: 5,
          netWeightMg: 3000,
          images: [],
        },
      },
    },
  });
  const code = `E2E${Date.now().toString(36).toUpperCase()}`;
  await db.coupon.create({
    data: { code, type: "PERCENT", value: 10, usageLimit: 1, perUserLimit: 1 },
  });

  await buyerReachesCheckout(page, slug, "Coupon Buyer");
  await page.getByLabel("Coupon code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("checkout-discount")).toContainText("−₹500");
  await page.getByRole("button", { name: "Pay ₹4,500" }).click();
  await expect(page).toHaveURL(/\/orders\/[a-z0-9]+\/success$/, { timeout: 20_000 });
  const orderId = /\/orders\/([a-z0-9]+)\/success/.exec(page.url())![1]!;
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  expect(order).toMatchObject({
    status: "PAID",
    discountInPaise: 50_000,
    totalInPaise: 450_000,
    couponCode: code,
  });
  expect((await db.coupon.findUniqueOrThrow({ where: { code } })).usedCount).toBe(1);

  // Someone else tries the used-up code.
  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("coupon-2") },
  });
  const p2 = await ctx.newPage();
  await buyerReachesCheckout(p2, slug, "Second Buyer");
  await p2.getByLabel("Coupon code").fill(code);
  await p2.getByRole("button", { name: "Apply" }).click();
  await expect(p2.getByRole("form", { name: "Coupon" }).getByRole("alert")).toBeVisible();
  await expect(p2.getByTestId("checkout-discount")).toHaveCount(0);
  await ctx.close();
});
