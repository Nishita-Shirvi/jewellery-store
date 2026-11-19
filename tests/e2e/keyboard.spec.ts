import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { uniqueSlug, visitorIp } from "./fixtures";

/**
 * The whole purchase by keyboard only (Phase 28): product → add to cart → cart → sign up →
 * address (State filled in from the pincode) → pay → order confirmed. No mouse clicks: every
 * control is reached with Tab and used with Enter / Space / typing. Checkout is axe-checked too.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

/** Stand-in for Razorpay's checkout.js (as in checkout.spec.ts): "pays" at once, correctly signed. */
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

/** Presses Tab until `target` has focus (fails if it never does — i.e. it can't be reached). */
async function tabTo(page: Page, target: Locator, max = 150) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Couldn't reach ${target} with the Tab key`);
}

async function typeInto(page: Page, target: Locator, text: string) {
  await tabTo(page, target);
  await page.keyboard.type(text);
}

test("buy a piece using only the keyboard", async ({ page }) => {
  test.setTimeout(120_000);
  const category = await db.category.findFirstOrThrow({ where: { isActive: true } });
  const slug = uniqueSlug("e2e-keyboard");
  await db.product.create({
    data: {
      name: "Keyboard Test Studs",
      slug,
      description: "Made by the keyboard browser test.",
      priceInPaise: 180_000,
      stock: 5,
      images: ["/images/products/floral-band-ring.svg"],
      categoryId: category.id,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 2000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: 180_000,
          stock: 5,
          netWeightMg: 2000,
          images: [],
        },
      },
    },
  });

  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_RAZORPAY }),
  );
  await page.goto(`/products/${slug}`);
  await page.waitForLoadState("networkidle");
  await tabTo(page, page.getByRole("button", { name: "Add to cart" }));
  await page.keyboard.press("Enter");
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await tabTo(page, page.getByRole("link", { name: "View cart" }));
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("₹1,800");

  await tabTo(page, page.getByRole("link", { name: "Proceed to checkout" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/login/);
  await tabTo(page, page.getByRole("link", { name: "Create an account" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/register/);
  await page.waitForLoadState("networkidle");

  await typeInto(page, page.getByLabel("Full name"), "Keyboard Buyer");
  await typeInto(
    page,
    page.getByLabel("Email", { exact: true }),
    `e2e-keys-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`,
  );
  await typeInto(page, page.getByLabel("Password", { exact: true }), "Keyboard2026pass");
  await typeInto(page, page.getByLabel("Confirm password"), "Keyboard2026pass");
  await tabTo(page, page.getByRole("button", { name: "Create account" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/checkout$/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");

  // Checkout itself passes the accessibility check.
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => v.id),
  ).toEqual([]);

  const form = page.getByRole("form", { name: "New address" });
  await typeInto(page, form.getByLabel("Full name"), "Keyboard Buyer");
  await typeInto(page, form.getByLabel("Mobile number"), "9876502468");
  await typeInto(page, form.getByLabel("House / flat, street"), "9 Key Street");
  await typeInto(page, form.getByLabel("City"), "Hyderabad");
  await typeInto(page, form.getByLabel("Pincode"), "500081");
  // The State was filled in from the pincode, and the customer is told.
  await expect(form.getByLabel("State")).toHaveValue("Telangana");
  await expect(form.getByTestId("pincode-hint")).toContainText("Telangana");
  await tabTo(page, form.getByRole("button", { name: "Save address" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: /Keyboard Buyer/ })).toBeChecked();

  await tabTo(page, page.getByRole("button", { name: "Pay ₹1,800" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/orders\/[a-z0-9]+\/success$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Your order is confirmed/ })).toBeVisible();
});

test("a state the customer chose is never overwritten by the pincode", async ({ page }) => {
  // Account → Addresses (the other address form).
  await page.goto("/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Pin Tester");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-pin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Keyboard2026pass");
  await page.getByLabel("Confirm password").fill("Keyboard2026pass");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20_000 });
  await page.goto("/account/addresses");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add a new address" }).click();
  const form = page.getByRole("form", { name: "New address" });
  await form.getByLabel("State").selectOption("Karnataka");
  await form.getByLabel("Pincode").fill("500081");
  await expect(form.getByLabel("State")).toHaveValue("Karnataka");
  await expect(form.getByTestId("pincode-hint")).toHaveText("");
});
