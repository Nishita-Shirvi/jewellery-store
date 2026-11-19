import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  createStaff,
  createVariantRing,
  hideTestProducts,
  staffLogin,
  uniqueSlug,
  visitorIp,
} from "./fixtures";

/**
 * Phase 24 "done when": the owner schedules a sale banner and a collection for a future time
 * without a deploy, and both go live — and expire — by themselves.
 * Admin forms take minutes (India time), so this waits for real minute boundaries (~2–3 min).
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await hideTestProducts(db);
  await db.$disconnect();
});

/** "YYYY-MM-DDTHH:mm" in India time, as a datetime-local input expects. */
const istLocal = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16);

/** Waits (in the test) until the real clock passes `when`, plus a little slack. */
async function waitUntil(page: Page, when: Date) {
  const ms = when.getTime() - Date.now() + 3_000;
  if (ms > 0) await page.waitForTimeout(ms);
}

test("owner schedules a banner and a collection; they go live and expire on time", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const tag = `e2e${Date.now().toString(36)}`;
  const ring = await createVariantRing(db);
  await db.product.update({ where: { slug: ring.slug }, data: { tags: [tag] } });
  const slug = uniqueSlug("e2e-diwali");
  const message = `Diwali preview sale ${tag}`;

  // Start at the next minute boundary that leaves ≥ 45 s to check "not yet"; end a minute later.
  const minute = 60_000;
  let startMs = Math.ceil((Date.now() + 45_000) / minute) * minute;
  if (startMs - Date.now() < 45_000) startMs += minute;
  const start = new Date(startMs);
  const end = new Date(startMs + minute);

  await staffLogin(page, await createStaff(db, ["OWNER"]), "/admin/content");
  await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();

  // Collection: every product with our tag, published, live from start to end.
  await page.goto("/admin/content/collections/new");
  const col = page.getByRole("form", { name: "Collection" });
  await col.getByLabel("Title", { exact: true }).fill("Diwali Gold Preview");
  await col.getByLabel("Address").fill(slug);
  await col.getByLabel("Every product matching these rules").check();
  await col.getByLabel("Any of these tags").fill(tag);
  await col.getByLabel("Status").selectOption("PUBLISHED");
  await col.getByLabel("Live from (India time)").fill(istLocal(start));
  await col.getByLabel("Until").fill(istLocal(end));
  await col.getByRole("button", { name: "Save collection" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Collection saved");

  // Announcement bar linking to it, same window.
  await page.goto("/admin/content");
  await page.getByText("New announcement").click();
  const ann = page.getByRole("form", { name: "New announcement" });
  await ann.getByLabel("Message").fill(message);
  await ann.getByLabel("Link (optional)").fill(`/collections/${slug}`);
  await ann.getByLabel("Link text").fill("Shop the sale");
  await ann.getByLabel("Status").selectOption("PUBLISHED");
  await ann.getByLabel("Live from (India time)").fill(istLocal(start));
  await ann.getByLabel("Until").fill(istLocal(end));
  await ann.getByRole("button", { name: "Save announcement" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Announcement saved");
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText("Scheduled").first()).toBeVisible();

  // A customer, before the start: nothing yet.
  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("content-shopper") },
  });
  const shopper = await ctx.newPage();
  expect(Date.now()).toBeLessThan(start.getTime());
  await shopper.goto("/");
  await expect(shopper.getByTestId("announcement").filter({ hasText: message })).toHaveCount(0);
  expect((await shopper.goto(`/collections/${slug}`))!.status()).toBe(404);

  // At the start time — no deploy, no admin action — both are live.
  await waitUntil(shopper, start);
  await shopper.goto("/");
  const bar = shopper.getByTestId("announcement");
  await expect(bar).toContainText(message);
  await bar.getByRole("link", { name: "Shop the sale" }).click();
  await expect(shopper).toHaveURL(new RegExp(`/collections/${slug}$`));
  await expect(shopper.getByRole("heading", { name: "Diwali Gold Preview" })).toBeVisible();
  await expect(shopper.getByRole("link", { name: new RegExp(ring.name) })).toBeVisible();

  // After the end time, both are gone by themselves.
  await waitUntil(shopper, end);
  await shopper.goto("/");
  await expect(shopper.getByTestId("announcement").filter({ hasText: message })).toHaveCount(0);
  expect((await shopper.goto(`/collections/${slug}`))!.status()).toBe(404);
  await ctx.close();
});

test("sale price: set a 'was' price in admin → crossed out with % off in the shop", async ({
  page,
}) => {
  const ring = await createVariantRing(db);
  await staffLogin(page, await createStaff(db, ["CATALOG_EDITOR"]), "/admin/products");
  const product = await db.product.findUniqueOrThrow({
    where: { slug: ring.slug },
    // Same order the store uses to pick the "from" price (price, then position, then id).
    include: {
      variants: {
        where: { isActive: true },
        orderBy: [{ priceInPaise: "asc" }, { position: "asc" }, { id: "asc" }],
      },
    },
  });
  const cheapest = product.variants[0]!;
  const price = cheapest.priceInPaise / 100;
  const was = Math.round(price * 1.25); // 20% off
  await page.goto(`/admin/products/${product.id}/variants`);
  await page.getByLabel(`Was price for ${cheapest.label || "base"}`).fill(String(was));
  await page.getByLabel(`Was price for ${product.variants[1]!.label}`).fill(String(price)); // not higher
  await page.getByRole("button", { name: "Save variants" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "must be higher than the price",
  );
  await page.getByLabel(`Was price for ${product.variants[1]!.label}`).fill("");
  await page.getByRole("button", { name: "Save variants" }).click();
  await expect(page.getByRole("main").getByText("Variants saved.")).toBeVisible();

  await page.goto(`/products?q=${encodeURIComponent(ring.name)}`);
  const card = page.getByRole("link", { name: new RegExp(ring.name) }).first();
  await expect(card).toContainText("20% off");
  await expect(card.locator("s")).toContainText(`₹${was.toLocaleString("en-IN")}`);
});

test("pages: draft stays private until published; the support role can't edit content", async ({
  page,
  browser,
}) => {
  const slug = uniqueSlug("e2e-care");
  await staffLogin(page, await createStaff(db, ["CATALOG_EDITOR"]), "/admin/content/pages/new");
  const form = page.getByRole("form", { name: "Page" });
  await form.getByLabel("Title").fill("Jewellery care");
  await form.getByLabel("Address").fill(slug);
  await form
    .getByLabel("Text")
    .fill("# Keep it dry\n\nStore each piece in its **own pouch**.\n\n<script>alert(1)</script>");
  await form.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Draft saved");

  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("page-visitor") },
  });
  const visitor = await ctx.newPage();
  expect((await visitor.goto(`/pages/${slug}`))!.status()).toBe(404);

  // The preview link shows the draft to whoever has it.
  const previewHref = await page.getByRole("link", { name: /Preview draft/ }).getAttribute("href");
  await visitor.goto(previewHref!);
  await expect(visitor.getByRole("status")).toContainText("Preview of the draft");
  await expect(visitor.getByRole("heading", { name: "Keep it dry" })).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Published");
  await visitor.goto(`/pages/${slug}`);
  await expect(visitor.getByRole("heading", { name: "Jewellery care" })).toBeVisible();
  await expect(visitor.locator("strong")).toHaveText("own pouch");
  await expect(visitor.getByText("<script>alert(1)</script>")).toBeVisible(); // shown as text, not run
  await ctx.close();

  const supportCtx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("support-content") },
  });
  const support = await supportCtx.newPage();
  await staffLogin(support, await createStaff(db, ["SUPPORT"]), "/admin");
  await support.goto("/admin/content");
  await expect(support).toHaveURL(/\/forbidden/);
  await supportCtx.close();
});
