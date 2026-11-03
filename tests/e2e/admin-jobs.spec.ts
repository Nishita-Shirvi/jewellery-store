import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { uniqueSlug, hideTestProducts } from "./fixtures";

/**
 * Phase 19: the store's cached product page shows an admin's edit straight away (cache cleared
 * on save), and the background-jobs page works.
 */

const db = new PrismaClient();
test.afterAll(async () => {
  await hideTestProducts(db);
  await db.$disconnect();
});

test("admin edits a product → the cached store page shows it at once; Jobs page lists failures", async ({
  page,
}) => {
  const category = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const slug = uniqueSlug("e2e-cache-ring");
  const product = await db.product.create({
    data: {
      name: "Cache Test Ring",
      slug,
      description: "Made by the cache browser test.",
      priceInPaise: 500_000,
      stock: 2,
      images: ["/images/products/floral-band-ring.svg"],
      categoryId: category.id,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 2000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: 500_000,
          stock: 2,
          netWeightMg: 2000,
          images: [],
        },
      },
    },
  });
  // A job that gave up, as the admin would find it.
  await db.job.create({
    data: {
      type: "email.order",
      payload: { orderId: "e2ejoborder01", event: "shipped" },
      status: "DEAD",
      attempts: 6,
      lastError: `Resend responded 401: invalid API key (${slug})`,
      finishedAt: new Date(),
    },
  });

  // Visit once so the page is in the cache.
  await page.goto(`/products/${slug}`);
  await expect(page.getByRole("heading", { name: "Cache Test Ring" })).toBeVisible();

  const adminEmail = `e2e-jobs-admin-${Date.now()}@example.com`;
  await db.user.create({
    data: {
      email: adminEmail,
      role: "ADMIN",
      passwordHash: await bcrypt.hash("E2eAdminPass2026", 10),
    },
  });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(adminEmail);
  await page.getByLabel("Password").fill("E2eAdminPass2026");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));

  await page.goto(`/admin/products/${product.id}`);
  await page.getByLabel("Name", { exact: true }).fill("Cache Test Ring Renamed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto(`/products/${slug}`);
  await expect(page.getByRole("heading", { name: "Cache Test Ring Renamed" })).toBeVisible();

  await page.goto("/admin/jobs");
  await expect(page.getByRole("heading", { name: "Background jobs" })).toBeVisible();
  const row = page.getByTestId("dead-job").filter({ hasText: slug });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Order #E2EJOB01".slice(0, 6)); // "Order "
});
