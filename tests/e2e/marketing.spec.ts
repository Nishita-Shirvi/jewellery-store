import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encodeEmail, signEmailLink } from "@/lib/marketing";
import { uniqueSlug, hideTestProducts, createStaff, staffLogin, visitorIp } from "./fixtures";

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

/** Phase 20 screens: newsletter, unsubscribe, notify me, referral link, admin stats. */

const db = new PrismaClient();
test.afterAll(async () => {
  await hideTestProducts(db);
  await db.$disconnect();
});

test("newsletter sign-up asks for consent and stores it; signed unsubscribe link works", async ({
  page,
}) => {
  const email = `e2e-news-${Date.now()}@example.com`;
  await page.goto("/");
  const form = page.getByRole("form", { name: "Newsletter" });
  await form.getByLabel("New collections, first").fill(email);
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByRole("alert")).toContainText("tick the box");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Subscribe" }).click();
  await expect(form.getByRole("status")).toContainText("check your inbox");
  const sub = await db.subscriber.findUniqueOrThrow({ where: { email } });
  expect(sub.status).toBe("PENDING");
  expect(sub.consentText).toMatch(/unsubscribe at any time/);

  // A tampered link is refused; the real one works.
  const t = signEmailLink(email, "unsubscribe", process.env.AUTH_SECRET!);
  await page.goto(`/unsubscribe?e=${encodeEmail("someone-else@example.com")}&t=${t}`);
  await page.getByRole("button", { name: "Unsubscribe me" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("isn't valid");
  await page.goto(`/unsubscribe?e=${encodeEmail(email)}&t=${t}`);
  await page.getByRole("button", { name: "Unsubscribe me" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("You're unsubscribed");
  expect((await db.subscriber.findUniqueOrThrow({ where: { email } })).status).toBe("UNSUBSCRIBED");
});

test("sold-out piece: 'Notify me' saves an alert", async ({ page }) => {
  const category = await db.category.findFirstOrThrow({ where: { slug: "earrings" } });
  const slug = uniqueSlug("e2e-soldout");
  const product = await db.product.create({
    data: {
      name: "Sold Out Studs",
      slug,
      description: "Made by the marketing browser test.",
      priceInPaise: 150_000,
      stock: 0,
      images: ["/images/products/everyday-hoop-earrings.svg"],
      categoryId: category.id,
      metalType: "SILVER",
      purity: "S925",
      metalColour: "SILVER",
      netWeightMg: 2000,
      variants: {
        create: {
          sku: slug.toUpperCase(),
          priceInPaise: 150_000,
          stock: 0,
          netWeightMg: 2000,
          images: [],
        },
      },
    },
    include: { variants: true },
  });
  await page.goto(`/products/${slug}`);
  await page.waitForLoadState("networkidle");
  const form = page.getByRole("form", { name: "Notify me" });
  await form.getByRole("textbox").fill("waiting-buyer@example.com");
  await form.getByRole("button", { name: "Notify me" }).click();
  await expect(form.getByRole("status")).toContainText("as soon as it's back");
  expect(
    await db.stockAlert.count({
      where: { variantId: product.variants[0]!.id, email: "waiting-buyer@example.com" },
    }),
  ).toBe(1);
});

test("referral link → friend signs up → linked to the referrer; account shows the link", async ({
  page,
}) => {
  const referrer = await db.user.create({
    data: {
      email: `e2e-referrer-${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash("Referrer2026", 10),
      referralCode: `E2E${String(Date.now()).slice(-6)}`,
    },
  });
  await page.goto(`/r/${referrer.referralCode!.toLowerCase()}`);
  await expect(page).toHaveURL(/\/$/);

  const friendEmail = `e2e-friend-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Friend Buyer");
  await page.getByLabel("Email", { exact: true }).fill(friendEmail);
  await page.getByLabel("Password", { exact: true }).fill("Playwright2026");
  await page.getByLabel("Confirm password").fill("Playwright2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/account/, { timeout: 20_000 });
  const friend = await db.user.findUniqueOrThrow({ where: { email: friendEmail } });
  const referral = await db.referral.findUniqueOrThrow({ where: { referredUserId: friend.id } });
  expect(referral).toMatchObject({ referrerId: referrer.id, status: "PENDING" });

  // The friend's own account page shows their own referral link.
  await expect(page.getByTestId("referral-link")).toContainText("/r/");
});

test("admin Marketing page shows campaign stats", async ({ page }) => {
  await staffLogin(page, await createStaff(db, ["OWNER"]));
  await page.goto("/admin/marketing");
  await expect(page.getByRole("heading", { name: "Marketing" })).toBeVisible();
  await expect(page.getByTestId("stat-unsubscribed")).toHaveText(/\d+/);
  await expect(page.getByRole("heading", { name: /Cart reminders/ })).toContainText("after 60 min");
});
