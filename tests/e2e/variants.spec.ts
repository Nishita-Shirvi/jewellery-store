import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createVariantRing } from "./fixtures";

/**
 * Phase 17 "done when": a product with 3 sizes × 2 colours can be bought per variant, and stock
 * is tracked per variant. Uses its own freshly created 3 × 2 ring (see fixtures.ts for why).
 */

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

const db = new PrismaClient();
let ring: Awaited<ReturnType<typeof createVariantRing>>;
const SKU = (size: string, colour: string) => ring.sku(size, colour);

test.beforeAll(async () => {
  // 3 of each in stock; size 14 / Rose is sold out so the page must refuse it.
  ring = await createVariantRing(db);
});
test.afterAll(async () => {
  await db.$disconnect();
});

test("buy two different variants of one ring; stock drops only for those variants", async ({
  page,
}) => {
  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_RAZORPAY }),
  );
  const before = new Map(
    (
      await db.productVariant.findMany({
        where: { productId: ring.id },
        select: { sku: true, stock: true },
      })
    ).map((v) => [v.sku, v.stock]),
  );

  await page.goto(`/products/${ring.slug}`);
  await expect(page.getByRole("heading", { name: ring.name })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Sold-out combination can't be bought.
  await page.getByRole("radio", { name: "14" }).check({ force: true });
  await page.getByRole("radio", { name: "Rose" }).check({ force: true });
  await expect(page.getByRole("button", { name: "Out of stock" })).toBeDisabled();

  // Size 12 / Rose × 2: price and SKU follow the choice.
  await page.getByRole("radio", { name: "12" }).check({ force: true });
  await expect(page.getByTestId("variant-price")).toHaveText("₹30,000");
  await expect(page.getByTestId("variant-details")).toContainText(SKU("12", "ROSE"));
  await expect(page.getByTestId("variant-details")).toContainText("rose gold");
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();

  // Size 10 / Yellow × 1
  await page.getByRole("radio", { name: "10" }).check({ force: true });
  await page.getByRole("radio", { name: "Yellow" }).check({ force: true });
  await expect(page.getByTestId("variant-price")).toHaveText("₹28,500");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();

  // Cart: two lines, each with its own variant label.
  await page.goto("/cart");
  const labels = page.getByTestId("cart-variant");
  await expect(labels).toHaveText(["Ring size 12 / Rose", "Ring size 10 / Yellow"]);
  await expect(page.getByTestId("cart-subtotal")).toHaveText("₹88,500");

  // Register + address + pay
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Variant Buyer");
  await page.getByLabel("Email").fill(`variant-${Date.now()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await page.getByLabel("Confirm password").fill("Playwright2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Full name").fill("Variant Buyer");
  await page.getByLabel("Mobile number").fill("9876501234");
  await page.getByLabel("House / flat, street").fill("7 Test Street");
  await page.getByLabel("City").fill("Chennai");
  await page.getByLabel("State").selectOption("Tamil Nadu");
  await page.getByLabel("Pincode").fill("600001");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByRole("radio", { name: /Variant Buyer/ })).toBeChecked();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(page).toHaveURL(/\/orders\/[a-z0-9]+\/success$/, { timeout: 20_000 });

  // Order page names the exact variants.
  await page.getByRole("link", { name: "View order" }).click();
  await expect(page.getByText(`${ring.name} (Ring size 12 / Rose)`)).toBeVisible();
  await expect(page.getByText(`${ring.name} (Ring size 10 / Yellow)`)).toBeVisible();

  // Stock: −2 for 12/Rose, −1 for 10/Yellow, nothing else moved, nothing left on hold.
  const after = await db.productVariant.findMany({
    where: { productId: ring.id },
    select: { sku: true, stock: true, reservedStock: true },
  });
  for (const v of after) {
    const expected =
      before.get(v.sku)! -
      (v.sku === SKU("12", "ROSE") ? 2 : v.sku === SKU("10", "YELLOW") ? 1 : 0);
    expect({ sku: v.sku, stock: v.stock, held: v.reservedStock }).toEqual({
      sku: v.sku,
      stock: expected,
      held: 0,
    });
  }
  const product = await db.product.findUniqueOrThrow({ where: { id: ring.id } });
  expect(product.stock).toBe(after.reduce((n, v) => n + v.stock, 0));

  // The order lines carry the SKUs.
  const lines = await db.orderItem.findMany({
    where: { productId: ring.id },
    orderBy: { id: "desc" },
    take: 2,
    select: { sku: true, quantity: true },
  });
  expect(lines.map((l) => `${l.sku}×${l.quantity}`).sort()).toEqual(
    [`${SKU("10", "YELLOW")}×1`, `${SKU("12", "ROSE")}×2`].sort(),
  );
});

test("admin: add sizes to a product, bulk-set stock, bad SKU refused", async ({ page }) => {
  // A throwaway product with a single base variant, like every product after the migration.
  const category = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const slug = `e2e-variant-admin-${Date.now()}`;
  const product = await db.product.create({
    data: {
      name: "E2E Admin Ring",
      slug,
      description: "Created by the variants E2E test.",
      priceInPaise: 10_000_00,
      stock: 1,
      images: ["/images/products/floral-band-ring.svg"],
      categoryId: category.id,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 2000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: 10_000_00,
          stock: 1,
          netWeightMg: 2000,
          images: [],
        },
      },
    },
  });

  // Its own admin account, so the test doesn't depend on the seeded admin's password.
  const adminEmail = `e2e-admin-${Date.now()}@example.com`;
  await db.user.create({
    data: {
      email: adminEmail,
      name: "E2E Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash("E2eAdminPass2026", 10),
    },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill("E2eAdminPass2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.goto(`/admin/products/${product.id}/variants`);
  await expect(page.getByRole("heading", { name: "Variants: E2E Admin Ring" })).toBeVisible();
  await page.getByLabel("Option 1 name").fill("Ring size");
  await page.getByLabel("Values (comma separated)").first().fill("8, 9");
  await page.getByRole("button", { name: "Save options & create combinations" }).click();
  await expect(page.getByRole("form", { name: "Options" }).getByRole("status")).toContainText(
    "2 new, 1 switched off",
  );

  // Bulk: every stock to 4. Then a bad SKU is refused and nothing changes.
  await page.reload();
  await page.getByLabel("Set every stock to").fill("4");
  await page.getByRole("button", { name: "Save variants" }).click();
  await expect(page.getByRole("form", { name: "Variants" }).getByRole("status")).toContainText(
    "Variants saved.",
  );
  const saved = await db.product.findUniqueOrThrow({ where: { id: product.id } });
  expect(saved.stock).toBe(8); // 2 active variants × 4; the retired base no longer counts

  await page.reload();
  await page.getByLabel("SKU for Ring size 8").fill("bad sku!");
  await page.getByRole("button", { name: "Save variants" }).click();
  await expect(page.getByRole("form", { name: "Variants" }).getByRole("alert")).toContainText(
    "SKU",
  );
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(8);

  // The store page now shows the size picker.
  await page.goto(`/products/${slug}`);
  await expect(page.getByRole("radio", { name: "9" })).toBeAttached();
});
