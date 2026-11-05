import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createStaff, staffLogin, visitorIp } from "./fixtures";

/**
 * No courier service connected (no SHIPROCKET_* keys in tests): the customer is told the store
 * will update them, the owner adds tracking by hand, and the customer sees each update.
 * Plus the error pages' ways out.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

async function customerWithPaidOrder() {
  const email = `e2e-delivery-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`;
  const password = "Delivery2026pass";
  const user = await db.user.create({
    data: { email, name: "Delivery Tester", passwordHash: await bcrypt.hash(password, 10) },
  });
  const variant = await db.productVariant.findFirstOrThrow({
    where: { product: { slug: "floral-band-ring" } },
    include: { product: true },
  });
  const order = await db.order.create({
    data: {
      userId: user.id,
      status: "PAID",
      paidAt: new Date(),
      subtotalInPaise: variant.priceInPaise,
      totalInPaise: variant.priceInPaise,
      addressSnapshot: {
        fullName: "Delivery Tester",
        phone: "9876501111",
        line1: "1 Test Road",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
        country: "IN",
      },
      items: {
        create: {
          productId: variant.productId,
          variantId: variant.id,
          productName: variant.product.name,
          productSlug: variant.product.slug,
          priceInPaise: variant.priceInPaise,
          quantity: 1,
          lineTotalInPaise: variant.priceInPaise,
          productSnapshot: {},
        },
      },
    },
  });
  return { email, password, order };
}

test("no courier service: customer waits, owner adds tracking by hand, customer sees updates", async ({
  page,
  browser,
}) => {
  const { email, password, order } = await customerWithPaidOrder();

  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto(`/account/orders/${order.id}`);
  await expect(page.getByTestId("delivery-waiting")).toContainText(
    "Waiting for a delivery update from the store",
  );

  // The owner ships it with their own courier and types the details.
  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("delivery-owner") },
  });
  const owner = await ctx.newPage();
  await staffLogin(owner, await createStaff(db, ["OWNER"]), `/admin/orders/${order.id}`);
  const details = owner.getByRole("form", { name: "Tracking details" });
  await details.getByLabel("Courier").fill("Blue Dart");
  await details.getByLabel("Tracking number").fill(`BD${Date.now()}`);
  await details.getByLabel("Tracking link").fill("https://www.bluedart.com/tracking");
  await details.getByRole("button", { name: "Save & mark shipped" }).click();
  const update = owner.getByRole("form", { name: "Delivery update" });
  await expect(update).toBeVisible();
  await update.getByLabel("Update").selectOption("OUT_FOR_DELIVERY");
  await update.getByLabel("Location").fill("Hyderabad");
  await update.getByRole("button", { name: "Post update" }).click();
  await expect(owner.getByText("Out for delivery").first()).toBeVisible();
  await ctx.close();

  // The customer sees the courier, tracking link and the update.
  await page.reload();
  await expect(page.getByTestId("delivery-waiting")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Tracking · Blue Dart/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Track on courier site" })).toHaveAttribute(
    "href",
    "https://www.bluedart.com/tracking",
  );
  await expect(page.getByText("Out for delivery")).toBeVisible();
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("SHIPPED");
});

test("page not found: a 404 with ways out (log in when signed out, account when signed in)", async ({
  page,
}) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res!.status()).toBe(404);
  const nav = page.getByRole("navigation", { name: "Where to go next" });
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  await expect(nav.getByRole("link", { name: "Browse jewellery" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(nav.getByRole("link", { name: "Help" })).toBeVisible();

  const { email, password } = await customerWithPaidOrder();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/products/no-such-piece");
  await expect(
    page
      .getByRole("navigation", { name: "Where to go next" })
      .getByRole("link", { name: "My account" }),
  ).toHaveAttribute("href", "/account");
});
