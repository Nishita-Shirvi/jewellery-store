import { expect, test } from "@playwright/test";

/** Replaces Razorpay's checkout.js: "pays" instantly and returns a correctly signed response. */
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

test("browse → cart → checkout → pay (Razorpay test mode stand-in)", async ({ page }) => {
  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_RAZORPAY }),
  );
  const email = `buyer-${Date.now()}@example.com`;

  // Browse
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Featured pieces" })).toBeVisible();
  await page.getByRole("link", { name: "Browse jewellery" }).click();
  await expect(page.getByRole("heading", { name: "All jewellery" })).toBeVisible();
  await page.getByLabel("Category").selectOption("earrings");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("link", { name: /Everyday Hoop Earrings/ }).click();

  // Add to cart as a guest
  await expect(page.getByRole("heading", { name: "Everyday Hoop Earrings" })).toBeVisible();
  await page.waitForLoadState("networkidle"); // wait until the page's JavaScript is ready
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.getByRole("group", { name: "Quantity" }).getByRole("status")).toHaveText("2");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("₹4,400");

  // Checkout requires login → register, cart is kept
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcheckout/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Playwright Buyer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await page.getByLabel("Confirm password").fill("Playwright2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByTestId("checkout-total")).toHaveText("₹4,400");
  await page.waitForLoadState("networkidle");

  // Address + pay
  await page.getByLabel("Full name").fill("Playwright Buyer");
  await page.getByLabel("Mobile number").fill("9876501234");
  await page.getByLabel("House / flat, street").fill("7 Test Street");
  await page.getByLabel("City").fill("Chennai");
  await page.getByLabel("State").selectOption("Tamil Nadu");
  await page.getByLabel("Pincode").fill("600001");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("radio")).toBeChecked();
  await page.getByRole("button", { name: "Pay ₹4,400" }).click();

  await expect(page).toHaveURL(/\/orders\/[a-z0-9]+\/success$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Your order is confirmed/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cart, 0 items/ })).toBeVisible();

  // Order history
  await page.getByRole("link", { name: "View order" }).click();
  await expect(page.getByText("Order confirmed")).toBeVisible();
  await expect(page.getByText("₹4,400").first()).toBeVisible();
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("legal pages required by Razorpay exist", async ({ page }) => {
  const pages: [string, string][] = [
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms and conditions"],
    ["/refund-policy", "Refunds and cancellations"],
    ["/shipping-policy", "Shipping policy"],
    ["/contact", "Contact us"],
  ];
  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});
