import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createStaff, staffLogin, visitorIp } from "./fixtures";

/**
 * Phase 29 in the browser: the owner checks a product CSV (bad row → nothing saved), sees the
 * GST summary, reconciles a COD sheet, creates an API key and uses it on the Products API.
 * Staff without the permission can't open the pages.
 */

test.beforeEach(async ({ context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": visitorIp(info.title) });
});

const db = new PrismaClient();
test.afterAll(async () => {
  await db.apiKey.deleteMany({ where: { name: { startsWith: "e2e-" } } });
  await db.$disconnect();
});

test("accounting: import check, GST summary, reconciliation, API key", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await staffLogin(page, await createStaff(db, ["OWNER"]), "/admin/accounting");
  await expect(page.getByRole("heading", { name: "Accounting" })).toBeVisible();
  await expect(page.getByTestId("gst-summary")).toContainText("Invoices");

  const csv =
    "slug,name,description,category,metal_type,purity,metal_colour,net_weight_g,price\n" +
    "e2e-csv-ring,E2E CSV ring,x,no-such-category,SILVER,S925,SILVER,4,abc\n";
  const importForm = page.getByRole("form", { name: "Import products" });
  await importForm.getByLabel("Products CSV file").setInputFiles({
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await importForm.getByRole("button", { name: "Import" }).click();
  await expect(page.getByTestId("import-report")).toContainText("nothing was saved");
  await expect(page.getByTestId("import-report")).toContainText("Line 2");
  expect(await db.product.count({ where: { slug: "e2e-csv-ring" } })).toBe(0);

  const recon = page.getByRole("form", { name: "Reconcile" });
  await recon.getByLabel("File type").selectOption("cod_remittance");
  await recon.getByLabel("Report file").setInputFiles({
    name: "remit.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("AWB,COD Amount\nE2E-NO-SUCH-AWB,100\n"),
  });
  await recon.getByRole("button", { name: "Check" }).click();
  await expect(page.getByTestId("recon-run")).toContainText("Unknown parcel");

  const gst = await page.request.get(
    `/api/admin/accounting?what=gst&kind=hsn&month=${new Date().toISOString().slice(0, 7)}`,
  );
  expect(gst.status()).toBe(200);
  expect(await gst.text()).toContain("HSN");

  await page.goto("/admin/integrations");
  await page.getByLabel("What uses this key").fill("e2e-feed");
  await page.getByRole("button", { name: "Create key" }).click();
  const key = (await page.getByTestId("secret-once").textContent())!.trim();
  expect(key).toMatch(/^sk_live_/);

  expect((await request.get("/api/v1/products")).status()).toBe(401);
  const res = await request.get("/api/v1/products?limit=2", {
    headers: { Authorization: `Bearer ${key}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.data.length).toBeGreaterThan(0);
  expect(body.data[0].price.currency).toBe("INR");
});

test("staff without accounting permission are kept out", async ({ page }) => {
  await staffLogin(page, await createStaff(db, ["SUPPORT"]), "/admin");
  await page.goto("/admin/accounting");
  await expect(page.getByRole("heading", { name: "Accounting" })).toHaveCount(0);
  const res = await page.request.get("/api/admin/accounting?what=products");
  expect(res.status()).toBe(403);
});
