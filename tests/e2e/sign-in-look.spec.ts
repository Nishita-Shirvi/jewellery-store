import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createStaff, staffLogin, visitorIp } from "./fixtures";

/**
 * Admin → Appearance → Sign-in & top bar: by default the showroom video plays behind log in and
 * create account (only there) and the tagline bar sits above the header; the owner can change
 * both without a deploy.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

test("sign-in video and top bar, and the owner can change them", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const shopper = await browser.newPage({
    extraHTTPHeaders: { "x-forwarded-for": visitorIp("sign-in-look-shopper") },
  });

  // Defaults: video on log in and create account, not on forgot password or the home page.
  for (const path of ["/login", "/register"]) {
    await shopper.goto(path);
    await expect(shopper.getByTestId("auth-video")).toHaveCount(1);
  }
  await shopper.goto("/forgot-password");
  await expect(shopper.getByTestId("auth-backdrop")).toHaveCount(0);
  await shopper.goto("/");
  await expect(shopper.getByTestId("auth-backdrop")).toHaveCount(0);

  await staffLogin(page, await createStaff(db, ["OWNER"]), "/admin/appearance/sign-in");
  const form = page.getByRole("form", { name: "Sign-in and top bar" });
  const tagline = `Gold for every story ${Date.now().toString(36)}`;
  try {
    await form.getByRole("textbox", { name: "Tagline", exact: true }).fill(tagline);
    await form.getByRole("checkbox", { name: "Play the background video" }).uncheck();
    await form
      .getByRole("textbox", { name: "Heading", exact: true })
      .fill("Welcome back to the showroom");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    await shopper.goto("/");
    await expect(shopper.getByTestId("tagline")).toHaveText(tagline);
    await shopper.goto("/login");
    await expect(shopper.getByTestId("auth-backdrop")).toHaveCount(1); // the still stays
    await expect(shopper.getByTestId("auth-video")).toHaveCount(0);
    await expect(shopper.getByText("Welcome back to the showroom")).toBeVisible();

    // A video from another website is refused.
    await form.getByRole("checkbox", { name: "Play the background video" }).check();
    await form
      .getByRole("textbox", { name: "Video", exact: true })
      .fill("https://evil.example/clip.mp4");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("fix the highlighted");
  } finally {
    await form.getByRole("button", { name: "Back to our defaults" }).click();
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  }
  await shopper.goto("/login");
  await expect(shopper.getByTestId("auth-video")).toHaveCount(1);
  await shopper.close();
});
