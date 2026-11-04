import type { Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

/**
 * Test data for browser tests. Each test makes its OWN product with a unique slug: product pages
 * are cached by slug (and Next keeps that cache on disk between runs), so a test that edited a
 * shared product straight in the database could be shown stale stock by the cache, and tests
 * running in parallel could change each other's stock.
 */

/** Slugs made in this test process (so each file hides only what it created). */
const made: string[] = [];

export function uniqueSlug(prefix: string): string {
  const slug = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  made.push(slug);
  return slug;
}

/**
 * A ring in 3 sizes × 2 colours (like the seeded "Plain Gold Band"): 3 of each in stock except
 * size 14 / Rose (sold out). Price ₹28,500 / ₹30,000 / ₹31,500 by size.
 */
export async function createVariantRing(db: PrismaClient, slug = uniqueSlug("e2e-band")) {
  const category = await db.category.findFirstOrThrow({ where: { slug: "rings" } });
  const sizes = ["10", "12", "14"];
  const colours = ["Yellow", "Rose"];
  const product = await db.product.create({
    data: {
      name: `E2E Band ${slug.slice(-4)}`,
      slug,
      description: "A ring made by the browser tests.",
      priceInPaise: 2_850_000,
      stock: 15,
      images: ["/images/products/floral-band-ring.svg"],
      categoryId: category.id,
      metalType: "GOLD",
      purity: "K22",
      metalColour: "YELLOW",
      netWeightMg: 3000,
      options: {
        create: [
          {
            name: "Ring size",
            position: 0,
            values: { create: sizes.map((value, position) => ({ value, position })) },
          },
          {
            name: "Metal colour",
            position: 1,
            values: { create: colours.map((value, position) => ({ value, position })) },
          },
        ],
      },
    },
    include: { options: { include: { values: true }, orderBy: { position: "asc" } } },
  });
  const [sizeOpt, colourOpt] = product.options;
  const sku = (size: string, colour: string) =>
    `${slug.toUpperCase()}-${size}-${colour.toUpperCase()}`;
  let position = 0;
  for (const [si, size] of sizes.entries()) {
    for (const colour of colours) {
      const ids = [
        sizeOpt!.values.find((v) => v.value === size)!.id,
        colourOpt!.values.find((v) => v.value === colour)!.id,
      ];
      await db.productVariant.create({
        data: {
          productId: product.id,
          sku: sku(size, colour),
          optionKey: [...ids].sort().join("."),
          label: `Ring size ${size} / ${colour}`,
          priceInPaise: 2_850_000 + si * 150_000,
          netWeightMg: 3000 + si * 150,
          stock: size === "14" && colour === "Rose" ? 0 : 3,
          metalColour: colour === "Rose" ? "ROSE" : "YELLOW",
          position: position++,
          images: [],
          optionValues: { create: ids.map((optionValueId) => ({ optionValueId })) },
        },
      });
    }
  }
  return { id: product.id, slug, name: product.name, sku };
}

/**
 * Chooses a size / colour the way a person does: clicks the visible button (Playwright scrolls it
 * into view). Forcing a click on the hidden radio can land on the sticky header instead.
 */
export async function pickOption(page: Page, option: string, value: string) {
  await page.getByRole("group", { name: option }).getByText(value, { exact: true }).click();
}

/**
 * Hides the products this test file made, so they don't fill the shop listings other tests
 * browse. Hidden, not deleted: orders may point at them. Only this process's own products, so a
 * file finishing never hides a product another file is still using.
 */
export async function hideTestProducts(db: PrismaClient) {
  if (made.length === 0) return;
  await db.product.updateMany({
    where: { slug: { in: made.splice(0) } },
    data: { isActive: false },
  });
}

// ───────────────────────── staff (Phase 21) ─────────────────────────

export interface TestStaff {
  id: string;
  email: string;
  password: string;
  /** Authenticator secret (null = 2FA not set up yet). */
  secret: string | null;
}

/** A staff member with the given roles and (by default) two-step sign-in already set up. */
export async function createStaff(
  db: PrismaClient,
  roleKeys: string[],
  options: { twoFactor?: boolean } = {},
): Promise<TestStaff> {
  const { seal } = await import("@/lib/secret-box");
  const { generateTotpSecret } = await import("@/lib/totp");
  const bcrypt = (await import("bcryptjs")).default;
  const email = `e2e-staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const password = "E2eStaffPass2026";
  const secret = options.twoFactor === false ? null : generateTotpSecret();
  const user = await db.user.create({
    data: {
      email,
      name: `Staff ${roleKeys.join("+")}`,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 10),
      ...(secret
        ? {
            totpSecret: seal(secret, process.env.AUTH_SECRET!, "totp"),
            totpEnabledAt: new Date(),
          }
        : {}),
    },
  });
  for (const key of roleKeys) {
    const role = await db.staffRole.findUniqueOrThrow({ where: { key } });
    await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return { id: user.id, email, password, secret };
}

/** Logs in and passes two-step sign-in with the current code from the "app". */
export async function staffLogin(page: Page, staff: TestStaff, then = "/admin") {
  const { totpAt } = await import("@/lib/totp");
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(staff.email);
  await page.getByLabel("Password").fill(staff.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(then);
  await page.waitForURL(/\/staff\/2fa/);
  if (!staff.secret) return; // the caller goes through setup
  await page.getByLabel("Code from your authenticator app").fill(totpAt(staff.secret, new Date()));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/staff/2fa"), { timeout: 20_000 });
}

/**
 * A made-up client IP per test (sent as X-Forwarded-For, which the app reads behind Vercel), so
 * the per-IP sign-up / login limits treat each test as a different visitor — as real customers are.
 */
export function visitorIp(title: string): string {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `10.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${(h & 253) + 1}`;
}

/** Collects Content-Security-Policy violations the browser reports (they show as console errors). */
export function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Content-Security-Policy/i.test(text)) violations.push(text);
  });
  return violations;
}
