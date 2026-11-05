import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { visitorIp } from "./fixtures";

/**
 * Phase 27 "done when": data export and deletion work end to end, consent toggles change
 * behaviour, and seller / grievance details are visible.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

test("consents, download my data, delete my account", async ({ page }) => {
  const email = `e2e-privacy-${Date.now()}-${Math.random().toString(36).slice(2, 5)}@example.com`;
  const password = "Privacy2026pass";

  // Sign up, opting in to marketing emails (the box is unticked by default).
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Privacy Tester");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const optIn = page.getByRole("checkbox", { name: /Email me offers/ });
  await expect(optIn).not.toBeChecked();
  await optIn.check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/register"));

  // Account → Privacy shows the choices; turning SMS off is saved and logged.
  await page.goto("/account/privacy");
  await expect(page.getByTestId("consent-email_marketing")).toHaveText("On");
  await expect(page.getByTestId("consent-sms_updates")).toHaveText("On");
  await page
    .getByRole("listitem")
    .filter({ hasText: "Order updates by SMS" })
    .getByRole("button", { name: "Turn off" })
    .click();
  await expect(page.getByTestId("consent-sms_updates")).toHaveText("Off");
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  expect(user).toMatchObject({ emailMarketingConsent: true, smsUpdatesConsent: false });
  expect(
    (
      await db.consentEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })
    ).map((e) => `${e.channel}:${e.granted}:${e.source}`),
  ).toEqual(["email_marketing:true:register", "sms_updates:false:account"]);

  // Download my data.
  const download = await page.request.get("/api/account/export");
  expect(download.headers()["content-disposition"]).toContain("attachment");
  const data = await download.json();
  expect(data.account.email).toBe(email);
  expect(data.consents.orderUpdateSms).toBe(false);

  // Delete the account: wrong password refused, then done.
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByLabel("Your password").fill("not-my-password");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("form", { name: "Delete account" }).getByRole("alert")).toContainText(
    "password isn't right",
  );
  // The form clears after a failed attempt (as forms do): type both again.
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByLabel("Your password").fill(password);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL(/\?account=deleted/);

  // Signed out, and the old login no longer works.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Incorrect");
  const deleted = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(deleted.deletedAt).not.toBeNull();
  expect(deleted.email).toMatch(/@deleted\.invalid$/);
});

test("product pages show the seller, grievance officer, country of origin and returns", async ({
  page,
}) => {
  await page.goto("/products/floral-band-ring");
  const seller = page.getByTestId("seller-details");
  await expect(seller).toContainText("Sold by");
  await expect(seller).toContainText("Grievance officer");
  await expect(seller.getByRole("link", { name: "Returns and refunds" })).toHaveAttribute(
    "href",
    "/refund-policy",
  );
  await expect(page.getByText("Country of origin")).toBeVisible();
  await expect(page.getByText("Inclusive of all taxes").first()).toBeVisible();
});
