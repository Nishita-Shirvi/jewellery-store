import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createStaff, staffLogin, visitorIp } from "./fixtures";

/**
 * Accessibility (Phase 28): axe (WCAG 2.1 A + AA rules) on the main pages a shopper and the
 * owner use. Fails on any "serious" or "critical" violation; lists the rest in the report.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

async function scan(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} — ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(", ")}`,
  );
  test.info().annotations.push({
    type: `axe ${name}`,
    description: `${results.violations.length} violation(s), ${bad.length} serious/critical`,
  });
  expect(summary, `axe on ${name}`).toEqual([]);
}

test("shopper pages have no serious accessibility problems", async ({ page }) => {
  test.setTimeout(120_000);
  const product = await db.product.findFirstOrThrow({
    where: { isActive: true, slug: "floral-band-ring" },
    select: { slug: true, category: { select: { slug: true } } },
  });
  for (const [name, url] of [
    ["home", "/"],
    ["collection", `/collections/${product.category.slug}`],
    ["product", `/products/${product.slug}`],
    ["search", "/search?q=ring"],
    ["cart", "/cart"],
    ["login", "/login"],
    ["register", "/register"],
    ["contact", "/contact"],
    ["not found", "/no-such-page"],
  ] as const) {
    await page.goto(url);
    await scan(page, name);
  }
});

test("admin pages have no serious accessibility problems", async ({ page }) => {
  test.setTimeout(120_000);
  await staffLogin(page, await createStaff(db, ["OWNER"]), "/admin");
  for (const [name, url] of [
    ["dashboard", "/admin"],
    ["orders", "/admin/orders"],
    ["products", "/admin/products"],
    ["system", "/admin/system"],
    ["accounting", "/admin/accounting"],
  ] as const) {
    await page.goto(url);
    await scan(page, name);
  }
});

test("the check itself catches real problems (an unlabelled button and image)", async ({
  page,
}) => {
  await page.setContent(
    '<html lang="en"><head><title>x</title></head><body><main><img src="/x.svg"><button></button></main></body></html>',
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const ids = results.violations.map((v) => v.id);
  expect(ids).toContain("image-alt");
  expect(ids).toContain("button-name");
});

test("missing pages answer 404, not 200 (search engines and the error pages rely on it)", async ({
  request,
}) => {
  // A loading placeholder (loading.tsx) on these routes would stream a 200 before the page
  // knows the item doesn't exist — keep them without one.
  for (const url of [
    "/products/no-such-product-e2e",
    "/collections/no-such-collection-e2e",
    "/pages/no-such-page-e2e",
    "/no-such-route-e2e",
  ])
    expect((await request.get(url)).status(), url).toBe(404);
});

test("phone width: no page is wider than the screen", async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 },
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("phone-width") },
  });
  const page = await ctx.newPage();
  const tooWide = async (url: string) => {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  };
  for (const url of [
    "/",
    "/products",
    "/collections/rings",
    "/products/floral-band-ring",
    "/cart",
    "/login",
    "/register",
  ])
    expect(await tooWide(url), url).toBeLessThanOrEqual(1);
  // Signed in: the header gains the account and log-out buttons; the account pages their menu.
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Phone Width Tester");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-phone-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("PhoneWidth2026");
  await page.getByLabel("Confirm password").fill("PhoneWidth2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 20_000 });
  for (const url of ["/account", "/account/orders", "/account/addresses", "/account/privacy"])
    expect(await tooWide(url), url).toBeLessThanOrEqual(1);
  await ctx.close();
});
