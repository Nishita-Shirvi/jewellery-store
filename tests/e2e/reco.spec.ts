import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hideTestProducts, uniqueSlug, visitorIp } from "./fixtures";

/** Phase 25 — recommendation widgets in the browser: what shows, and what gets counted. */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await hideTestProducts(db);
  await db.$disconnect();
});

async function piece(price: number, name: string) {
  const category = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const slug = uniqueSlug("e2e-reco");
  const p = await db.product.create({
    data: {
      name: `${name} ${slug.slice(-4)}`,
      slug,
      description: "Made by the recommendations browser test.",
      priceInPaise: price,
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
          priceInPaise: price,
          stock: 5,
          netWeightMg: 2000,
          images: [],
        },
      },
    },
    include: { variants: true },
  });
  return p;
}

/** Rows load as the shopper scrolls near them: scroll down the page in steps, like a person. */
async function scrollThrough(page: Page) {
  for (let i = 0; i < 20; i++) {
    const atEnd = await page.evaluate(() => {
      window.scrollBy(0, 500);
      return window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
    });
    await page.waitForTimeout(100);
    if (atEnd) break;
  }
}

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
async function stat(widget: string, event: string) {
  const rows = await db.recoStat.findMany({
    where: { widget, event, day: new Date(`${today()}T00:00:00Z`) },
  });
  return rows.reduce((s, r) => s + r.count, 0);
}

test("similar → click counted and remembered → add to cart credited; recently viewed", async ({
  page,
  context,
}) => {
  // Prices unique to this run, so look-alike rings from parallel runs don't crowd B out.
  const base = 3_00_000 + Math.floor(Math.random() * 5_000) * 100;
  const a = await piece(base, "Reco Alpha Ring");
  const b = await piece(base + 100, "Reco Beta Ring");
  const clicksBefore = await stat("similar", "click");
  const cartsBefore = await stat("similar", "add_to_cart");

  await page.goto(`/products/${a.slug}`);
  await scrollThrough(page);
  const similar = page.getByRole("region", { name: "You may also like" });
  await expect(similar).toBeVisible();
  // Closest in price in the same category: B should be among the suggestions.
  const card = similar.getByRole("link", { name: new RegExp(b.name) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/products/${b.slug}$`)); // marker removed
  const cookie = async () => (await context.cookies()).find((c) => c.name === "reco_attr");
  await expect.poll(async () => decodeURIComponent((await cookie())?.value ?? "")).toContain(b.id);
  const attr = await cookie();
  expect(attr?.httpOnly).toBe(true);
  await expect.poll(() => stat("similar", "click")).toBeGreaterThan(clicksBefore);
  expect(decodeURIComponent(attr!.value)).toContain(b.id);

  await page.reload(); // no marker any more: not counted twice
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await expect.poll(() => stat("similar", "add_to_cart")).toBeGreaterThan(cartsBefore);

  // Recently viewed: A shows on B's page (B itself doesn't).
  await scrollThrough(page);
  const recent = page.getByRole("region", { name: "Recently viewed" });
  await expect(recent.getByRole("link", { name: new RegExp(a.name) })).toBeVisible();
  await expect(recent.getByRole("link", { name: new RegExp(b.name) })).toHaveCount(0);
});

test("cart: free-shipping suggestions that close the gap; nightly job feeds 'bought together'", async ({
  page,
  request,
}) => {
  const cheap = await piece(50_000, "Reco Cheap Toe Ring"); // ₹500, below free shipping (₹999)
  const partner = await piece(6_00_000, "Reco Partner Ring");
  await page.goto(`/products/${cheap.slug}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("Added to cart.")).toBeVisible();
  await page.goto("/cart");
  const upsell = page.getByRole("region", { name: /more for free shipping/ });
  await expect(upsell.getByRole("heading", { level: 2 })).toContainText(
    "Add ₹499 more for free shipping",
  );
  await expect(upsell.getByRole("link").first()).toBeVisible();
  await expect(upsell.getByRole("link", { name: new RegExp(cheap.name) })).toHaveCount(0);

  // Two paid orders with both pieces, then the nightly job via the real cron endpoint.
  const user = await db.user.create({ data: { email: `e2e-reco-${Date.now()}@example.com` } });
  for (let i = 0; i < 2; i++)
    await db.order.create({
      data: {
        userId: user.id,
        status: "PAID",
        paidAt: new Date(),
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
        items: {
          create: [cheap, partner].map((p) => ({
            productId: p.id,
            variantId: p.variants[0]!.id,
            productName: p.name,
            productSlug: p.slug,
            priceInPaise: p.priceInPaise,
            quantity: 1,
            lineTotalInPaise: p.priceInPaise,
            productSnapshot: {},
          })),
        },
      },
    });
  await db.appSetting.deleteMany({ where: { key: "reco.computedAt" } }); // "due"
  const res = await request.get("/api/cron/jobs", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.ok()).toBe(true);
  await expect
    .poll(async () =>
      db.productPair.count({ where: { productId: cheap.id, relatedId: partner.id } }),
    )
    .toBe(1);

  await page.goto(`/products/${cheap.slug}`);
  await scrollThrough(page);
  const together = page.getByRole("region", { name: "Often bought together" });
  await expect(together.getByRole("link", { name: new RegExp(partner.name) })).toBeVisible();
  await page.goto("/cart");
  await scrollThrough(page);
  await expect(
    page
      .getByRole("region", { name: "Customers also bought" })
      .getByRole("link", { name: new RegExp(partner.name) }),
  ).toBeVisible();
});
