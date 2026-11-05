import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReconIssue, ReconSummary } from "@/services/recon.service";
import type * as JobsModule from "@/services/jobs.service";

/**
 * Phase 29 against a real database: bulk product CSV (500 rows, all-or-nothing), GST reports
 * matching the invoices, Razorpay settlement + COD remittance reconciliation, API keys and
 * outgoing webhooks.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("@/services/jobs.service", async (orig) => {
  const real = await orig<typeof JobsModule>();
  return { ...real, kickJobs: vi.fn(async () => undefined) };
});

const { db } = await import("@/lib/db");
const csv = await import("@/services/product-csv.service");
const { createInvoiceForOrder } = await import("@/services/invoice.service");
const gst = await import("@/services/gst-report.service");
const recon = await import("@/services/recon.service");
const integ = await import("@/services/integrations.service");
const { apiListProducts, apiGetProduct } = await import("@/services/public-api.service");
const { notifyOrder } = await import("@/services/notification.service");
const { parseCsv } = await import("@/lib/report/csv");

const RUN = `ac${Date.now().toString(36)}`;
const DAY = 86_400_000;
let userId = "";
let adminId = "";
let categoryId = "";

const HEADER =
  "slug,name,description,category,metal_type,purity,metal_colour,net_weight_g,price,stock,hsn_code,gst_rate,images,active";
const row = (i: number, price = "1500") =>
  `${RUN}-p${i},Ring ${i},A silver ring,${RUN},SILVER,S925,SILVER,4.2,${price},3,7113,3,/images/x.svg,yes`;

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
  adminId = (await db.user.create({ data: { email: `${RUN}-a@example.com`, role: "ADMIN" } })).id;
});
afterAll(async () => {
  const orders = await db.order.findMany({ where: { userId }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await db.job.deleteMany({ where: { type: "webhook.outgoing" } });
  await db.webhookEndpoint.deleteMany({ where: { url: { contains: RUN } } });
  await db.apiKey.deleteMany({ where: { name: { startsWith: RUN } } });
  await db.reconRun.deleteMany({ where: { createdById: adminId } });
  await db.refund.deleteMany({ where: { orderId: { in: ids } } });
  await db.payment.deleteMany({ where: { orderId: { in: ids } } });
  await db.invoice.deleteMany({ where: { orderId: { in: ids } } });
  await db.shipment.deleteMany({ where: { orderId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await db.order.deleteMany({ where: { userId } });
  const products = await db.product.findMany({ where: { categoryId }, select: { id: true } });
  await db.productVariant.deleteMany({ where: { productId: { in: products.map((p) => p.id) } } });
  await db.product.deleteMany({ where: { categoryId } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: { in: [userId, adminId] } } });
  await db.$disconnect();
});

describe("bulk product CSV", () => {
  it("imports 500 rows, re-imports as updates, and exports them back", async () => {
    const text = [HEADER, ...Array.from({ length: 500 }, (_, i) => row(i))].join("\n");
    const dry = await csv.importProductsCsv(text, { dryRun: true, adminId });
    expect(dry).toMatchObject({ created: 500, updated: 0, errors: 0, applied: false });
    expect(await db.product.count({ where: { categoryId } })).toBe(0);

    const done = await csv.importProductsCsv(text, { dryRun: false, adminId });
    expect(done).toMatchObject({ created: 500, errors: 0, applied: true });
    expect(await db.product.count({ where: { categoryId } })).toBe(500);

    const again = await csv.importProductsCsv([HEADER, row(0, "1999")].join("\n"), {
      dryRun: false,
      adminId,
    });
    expect(again).toMatchObject({ created: 0, updated: 1, applied: true });
    const p0 = await db.product.findUniqueOrThrow({ where: { slug: `${RUN}-p0` } });
    expect(p0.priceInPaise).toBe(199_900);

    const exported = parseCsv(await csv.exportProductsCsv());
    const header = exported[0]!.map((h) => h.replace(/^﻿/, ""));
    const line = exported.find((r) => r[header.indexOf("slug")] === `${RUN}-p0`)!;
    expect(line[header.indexOf("price")]).toBe("1999");
    expect(line[header.indexOf("net_weight_g")]).toBe("4.2");
  }, 180_000);

  it("saves nothing when any row is invalid, and lists each problem by line", async () => {
    const text = [
      HEADER,
      row(900),
      row(901, "free"),
      `${RUN}-p902,X,d,no-such-cat,SILVER,S925,SILVER,1,10,1,7113,3,/images/x.svg,yes`,
    ].join("\n");
    const r = await csv.importProductsCsv(text, { dryRun: false, adminId });
    expect(r.applied).toBe(false);
    expect(r.errors).toBe(2);
    expect(r.rows.find((x) => x.line === 3)!.errors.join(" ")).toMatch(/price/i);
    expect(r.rows.find((x) => x.line === 4)!.errors.join(" ")).toMatch(/category/);
    expect(await db.product.count({ where: { slug: `${RUN}-p900` } })).toBe(0);
  });
});

async function invoicedOrder(state: string, price: number) {
  const product = await db.product.findUniqueOrThrow({
    where: { slug: `${RUN}-p1` },
    include: { variants: { take: 1 } },
  });
  const o = await db.order.create({
    data: {
      userId,
      status: "PAID",
      paidAt: new Date(),
      subtotalInPaise: price,
      totalInPaise: price,
      addressSnapshot: {
        fullName: "Buyer",
        phone: "9876543210",
        line1: "1 Rd",
        city: "C",
        state,
        pincode: "500001",
        country: "IN",
      },
      items: {
        create: {
          productId: product.id,
          variantId: product.variants[0]!.id,
          productName: "Ring",
          productSlug: product.slug,
          priceInPaise: price,
          quantity: 1,
          lineTotalInPaise: price,
          productSnapshot: {},
          hsnCode: "7113",
          gstRateBps: 300,
        },
      },
    },
  });
  await createInvoiceForOrder(o.id);
  return o;
}

describe("GST reports", () => {
  it("summary and CSVs add up to the invoices; credit notes split tax pro rata", async () => {
    const month = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
    const before = await gst.gstSummary(month);
    const a = await invoicedOrder("Telangana", 103_000);
    await invoicedOrder("Maharashtra", 206_000);
    const after = await gst.gstSummary(month);
    expect(after.invoices - before.invoices).toBe(2);
    expect(after.totalInPaise - before.totalInPaise).toBe(309_000);
    expect(after.matchesInvoices).toBe(true);
    // 3% GST inclusive: 1030.00 → 1000.00 taxable + 30.00 tax (CGST+SGST, in-state)
    expect(after.cgstInPaise + after.sgstInPaise - before.cgstInPaise - before.sgstInPaise).toBe(
      3000,
    );
    expect(after.igstInPaise - before.igstInPaise).toBe(6000);

    const reg = parseCsv(await gst.gstReportCsv("register", month));
    expect(reg.some((r) => r.includes("36-Telangana") && r.includes("1030.00"))).toBe(true);
    const b2cs = parseCsv(await gst.gstReportCsv("b2cs", month));
    expect(b2cs[0]).toContain("Place of supply");
    expect(b2cs.some((r) => r[1] === "27-Maharashtra" && r[0] === "Inter-state")).toBe(true);
    const hsn = parseCsv(await gst.gstReportCsv("hsn", month));
    expect(hsn.some((r) => r[0] === "7113")).toBe(true);

    const pay = await db.payment.create({
      data: {
        orderId: a.id,
        providerOrderId: `order_${RUN}gst`,
        providerPaymentId: `pay_${RUN}gst`,
        status: "CAPTURED",
        amountInPaise: 103_000,
        createdAt: new Date(Date.now() - 30 * DAY),
      },
    });
    await db.refund.create({
      data: {
        orderId: a.id,
        paymentId: pay.id,
        reason: "test",
        amountInPaise: 51_500,
        status: "PROCESSED",
        processedAt: new Date(),
        razorpayRefundId: `rfnd_${RUN}`,
      },
    });
    const cn = parseCsv(await gst.gstReportCsv("credit-notes", month));
    const line = cn.find((r) => r[1] && r.includes("515.00"))!;
    expect(line).toBeTruthy();
    // half the invoice refunded → half its tax (7.50 + 7.50)
    expect(line.slice(5)).toEqual(["500.00", "7.50", "7.50", "0.00"]);
  });
});

describe("reconciliation", () => {
  it("settlement: matches, flags amount differences, unknown and unsettled payments", async () => {
    const mk = async (pid: string, amount: number, ageDays: number) => {
      const o = await db.order.create({
        data: {
          userId,
          status: "PAID",
          paidAt: new Date(),
          subtotalInPaise: amount,
          totalInPaise: amount,
          addressSnapshot: {},
        },
      });
      await db.payment.create({
        data: {
          orderId: o.id,
          providerOrderId: `order_${pid}`,
          providerPaymentId: pid,
          status: "CAPTURED",
          amountInPaise: amount,
          createdAt: new Date(Date.now() - ageDays * DAY),
        },
      });
    };
    await mk(`pay_${RUN}a`, 100_000, 5);
    await mk(`pay_${RUN}b`, 50_000, 5);
    await mk(`pay_${RUN}c`, 70_000, 4); // missing from report, old → a problem
    await mk(`pay_${RUN}d`, 80_000, 1); // missing, recent → explained
    const day = (d: number) => new Date(Date.now() - d * DAY).toISOString();
    const lines = recon.parseSettlementCsv(
      [
        "entity_id,type,amount,fee,tax,created_at",
        `pay_${RUN}a,payment,1000.00,20,3.6,${day(6)}`,
        `pay_${RUN}b,payment,450.00,10,1.8,${day(5)}`,
        `pay_${RUN}zz,payment,99.00,1,0,${day(5)}`,
        `rfnd_${RUN},refund,515.00,0,0,${day(1)}`,
        `pay_${RUN}x,payment,1.00,0,0,${day(0)}`,
      ].join("\n"),
    );
    const run = await recon.reconcileSettlement(lines, "test", adminId);
    const s = run.summary as unknown as ReconSummary;
    const issues = run.issues as unknown as ReconIssue[];
    expect(s.matched).toBe(2); // payment a + the refund
    expect(s.mismatched).toBe(1);
    expect(issues.find((i) => i.kind === "amount_mismatch")).toMatchObject({
      ref: `pay_${RUN}b`,
      expectedInPaise: 50_000,
      reportedInPaise: 45_000,
    });
    expect(
      issues
        .filter((i) => i.kind === "unknown_payment")
        .map((i) => i.ref)
        .sort(),
    ).toEqual([`pay_${RUN}x`, `pay_${RUN}zz`]);
    expect(issues.find((i) => i.ref === `pay_${RUN}c`)?.kind).toBe("not_settled");
    expect(issues.find((i) => i.ref === `pay_${RUN}d`)?.kind).toBe("not_settled_recent");
    expect(s.feesInPaise).toBe(3_640);
  });

  it("COD remittance: matches by AWB or order number, records cash once, flags overdue", async () => {
    const cod = (total: number, deliveredDaysAgo: number) =>
      db.order.create({
        data: {
          userId,
          status: "DELIVERED",
          paymentMethod: "COD",
          deliveredAt: new Date(Date.now() - deliveredDaysAgo * DAY),
          subtotalInPaise: total,
          totalInPaise: total,
          addressSnapshot: {},
        },
      });
    const a = await cod(250_000, 3);
    await db.shipment.create({
      data: { orderId: a.id, awb: `AWB${RUN}`, status: "DELIVERED", provider: "MANUAL" },
    });
    const b = await cod(120_000, 2);
    const late = await cod(90_000, 15);
    const prepaid = await db.order.create({
      data: {
        userId,
        status: "DELIVERED",
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
      },
    });
    const num = (id: string) => `#${id.slice(-8).toUpperCase()}`;
    const sheet = [
      "AWB,COD Amount",
      `AWB${RUN},2500`,
      `${num(b.id)},1100`,
      `${num(prepaid.id)},0.01`,
      "NOPE123,5",
    ].join("\n");
    const run = await recon.reconcileRemittance(recon.parseRemittanceCsv(sheet), "test", adminId);
    const issues = run.issues as unknown as ReconIssue[];
    expect(issues.find((i) => i.orderId === a.id)?.kind).toBe("ready_to_record");
    expect(issues.find((i) => i.orderId === b.id)?.kind).toBe("amount_mismatch");
    expect(issues.find((i) => i.orderId === prepaid.id)?.kind).toBe("not_cod");
    expect(issues.find((i) => i.ref === "NOPE123")?.kind).toBe("unknown_parcel");
    expect(issues.find((i) => i.orderId === late.id)?.kind).toBe("cod_overdue");
    expect((run.summary as unknown as ReconSummary).readyToRecord).toBe(1);

    const { markCashReceived } = await import("@/services/cod.service");
    expect((await markCashReceived([a.id], adminId, "test")).recorded).toBe(1);
    const again = await recon.reconcileRemittance(recon.parseRemittanceCsv(sheet), "test", adminId);
    const after = again.issues as unknown as ReconIssue[];
    expect(after.find((i) => i.orderId === a.id)?.kind).toBe("already_recorded");
  });
});

describe("API keys and public products API", () => {
  it("authenticates live keys only; list and detail show active products only", async () => {
    const key = await integ.createApiKey(`${RUN} feed`, adminId);
    expect(key.key).toMatch(/^sk_live_/);
    const stored = await db.apiKey.findUniqueOrThrow({ where: { id: key.id } });
    expect(stored.keyHash).not.toContain(key.key.slice(8));
    expect(await integ.authenticateApiKey(`Bearer ${key.key}`)).toBe(key.id);
    expect(await integ.authenticateApiKey(`Bearer ${key.key}x`)).toBeNull();
    expect(await integ.authenticateApiKey(key.key)).toBeNull();
    await integ.revokeApiKey(key.id);
    expect(await integ.authenticateApiKey(`Bearer ${key.key}`)).toBeNull();

    await db.product.update({ where: { slug: `${RUN}-p2` }, data: { isActive: false } });
    const p = await apiGetProduct(`${RUN}-p3`);
    expect(p).toMatchObject({
      price: { amount: 1500, currency: "INR" },
      inStock: true,
      gst: { hsn: "7113", ratePercent: 3 },
    });
    expect(p!.images[0]).toMatch(/^https?:\/\/.+\/x\.svg$/);
    expect(await apiGetProduct(`${RUN}-p2`)).toBeNull();
    const list = await apiListProducts({ page: 1, limit: 100, category: RUN });
    expect(list.total).toBe(499);
    expect(list.data).toHaveLength(100);
    expect(JSON.stringify(list.data[0])).not.toMatch(/reserved|cost/i);
  });
});

describe("outgoing webhooks", () => {
  it("queues one signed delivery per subscribed endpoint and sends it", async () => {
    const all = await integ.createWebhookEndpoint(`https://hooks.example.com/${RUN}/all`, []);
    await integ.createWebhookEndpoint(`https://hooks.example.com/${RUN}/ship`, ["order.shipped"]);
    const paused = await integ.createWebhookEndpoint(`https://hooks.example.com/${RUN}/off`, []);
    await integ.setWebhookActive(paused.id, false);
    await expect(integ.createWebhookEndpoint("https://127.0.0.1/x", [])).rejects.toThrow(
      /public https/,
    );
    const stored = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: all.id } });
    expect(stored.secret).not.toBe(all.secret);

    const o = await db.order.create({
      data: {
        userId,
        status: "CONFIRMED",
        subtotalInPaise: 1,
        totalInPaise: 1,
        addressSnapshot: {},
      },
    });
    await notifyOrder(o.id, "confirmed");
    const jobs = await db.job.findMany({ where: { type: "webhook.outgoing" } });
    const mine = jobs.filter(
      (j) => (j.payload as { data: { orderId: string } }).data.orderId === o.id,
    );
    expect(mine).toHaveLength(1);
    expect((mine[0]!.payload as { endpointId: string }).endpointId).toBe(all.id);

    const sent: { headers: Record<string, string>; body: string }[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      sent.push({ headers: init!.headers as Record<string, string>, body: String(init!.body) });
      return new Response("ok");
    });
    await integ.deliverWebhook(mine[0]!.payload as never);
    fetchSpy.mockRestore();
    expect(sent).toHaveLength(1);
    const sig = sent[0]!.headers["x-store-signature"]!;
    const t = Number(/t=(\d+)/.exec(sig)![1]);
    expect(sig).toBe(integ.signWebhook(all.secret, sent[0]!.body, t));
    expect(JSON.parse(sent[0]!.body)).toMatchObject({
      event: "order.confirmed",
      data: { orderId: o.id },
    });

    // paused after queueing → nothing is sent
    await integ.setWebhookActive(all.id, false);
    const spy2 = vi.spyOn(globalThis, "fetch");
    await integ.deliverWebhook(mine[0]!.payload as never);
    expect(spy2).not.toHaveBeenCalled();
    spy2.mockRestore();
  });
});
