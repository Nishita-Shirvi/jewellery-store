import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createStaff, staffLogin, visitorIp } from "./fixtures";

/**
 * Phase 22 "done when": a customer raises and follows a ticket end to end, support replies and
 * resolves it, and attachments are stored and served safely.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

async function customer(name: string) {
  const email = `e2e-${name}-${Date.now()}@example.com`;
  const user = await db.user.create({
    data: { email, name, passwordHash: await bcrypt.hash("Customer2026", 10) },
  });
  return { ...user, password: "Customer2026" };
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("customer raises a ticket with a photo from their order; support replies and resolves", async ({
  page,
  browser,
}) => {
  const faqQuestion = `How do I clean silver? ${Date.now()}`;
  await db.faq.create({
    data: { question: faqQuestion, answer: "Use a soft dry cloth.", category: "Jewellery care" },
  });
  await db.cannedReply.create({
    data: { title: `Replacement ${Date.now()}`, body: "We're sending a replacement clasp today." },
  });
  const subject = `Clasp came loose ${Date.now()}`;
  const buyer = await customer("ticket-buyer");
  const order = await db.order.create({
    data: {
      userId: buyer.id,
      status: "DELIVERED",
      subtotalInPaise: 150000,
      totalInPaise: 150000,
      addressSnapshot: {
        fullName: "Ticket Buyer",
        line1: "1 Road",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
        phone: "9876543210",
      },
      deliveredAt: new Date(),
    },
  });

  // Help centre first.
  await page.goto(`/help?q=${encodeURIComponent("clean silver")}`);
  await expect(page.getByTestId("faq").filter({ hasText: faqQuestion })).toBeVisible();

  // Raise a ticket from the order page shortcut.
  await login(page, buyer.email, buyer.password);
  await page.goto(`/account/orders/${order.id}`);
  await page.getByRole("link", { name: "Get help" }).click();
  await expect(page.getByLabel("Order (optional)")).toHaveValue(order.id);
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Your message").fill("The clasp came loose on day one. Photo attached.");
  await page
    .getByLabel(/Photos or PDF/)
    .setInputFiles({ name: "clasp.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toContainText("received your request");
  const ticketUrl = page.url();
  const attachmentHref = await page.getByRole("link", { name: "clasp.png" }).getAttribute("href");
  expect((await page.request.get(attachmentHref!)).headers()["content-type"]).toBe("image/png");

  // Support agent answers.
  const agent = await createStaff(db, ["SUPPORT"]);
  const ctx = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("agent") },
  });
  const p2 = await ctx.newPage();
  await staffLogin(p2, agent, "/admin/support");
  await p2.getByTestId("ticket-row").filter({ hasText: subject }).first().getByRole("link").click();
  await expect(p2.getByTestId("admin-ticket-message").first()).toContainText(
    "came loose on day one",
  );
  await p2.getByLabel("Insert a saved reply").selectOption({
    label: (await db.cannedReply.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).title,
  });
  await expect(p2.getByLabel("Message", { exact: true })).toHaveValue(/replacement clasp/);
  await p2.getByLabel("Mark as resolved").check();
  await p2.getByRole("button", { name: "Send" }).click();
  await expect(p2.getByTestId("admin-ticket-status")).toHaveText("Resolved");
  // Support staff can open the customer's photo too.
  expect((await p2.request.get(attachmentHref!)).status()).toBe(200);
  await ctx.close();

  // Customer sees the answer.
  await page.goto(ticketUrl);
  await expect(page.getByTestId("ticket-status")).toHaveText("Resolved");
  await expect(page.getByTestId("ticket-message").last()).toContainText("replacement clasp");

  // Another customer can't open the ticket or the photo.
  const stranger = await customer("ticket-stranger");
  const ctx3 = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("stranger") },
  });
  const p3 = await ctx3.newPage();
  await login(p3, stranger.email, stranger.password);
  expect((await p3.request.get(attachmentHref!)).status()).toBe(404);
  await p3.goto(new URL(ticketUrl).pathname);
  await expect(p3.getByRole("heading", { name: subject })).toHaveCount(0);
  await ctx3.close();
});
