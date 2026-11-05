import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Phase 25 — recommendations against a real PostgreSQL database: the nightly job (correct,
 * idempotent, safe to run twice at once), what each widget shows, and the click/purchase stats.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const { db } = await import("@/lib/db");
const reco = await import("@/services/reco.service");

const RUN = `rc${Date.now().toString(36)}`;
const DAY = 86_400_000;
let categoryId = "";
let otherCategoryId = "";
let userId = "";
let seq = 0;

async function product(
  opts: {
    price?: number;
    stock?: number;
    active?: boolean;
    category?: string;
    metal?: "GOLD" | "SILVER";
  } = {},
) {
  const n = ++seq;
  const price = opts.price ?? 10_000_00;
  return db.product.create({
    data: {
      name: `${RUN} piece ${n}`,
      slug: `${RUN}-p${n}`,
      description: "test",
      priceInPaise: price,
      stock: opts.stock ?? 5,
      isActive: opts.active ?? true,
      images: ["/x.svg"],
      categoryId: opts.category ?? categoryId,
      metalType: opts.metal ?? "GOLD",
      purity: opts.metal === "SILVER" ? "S925" : "K22",
      metalColour: opts.metal === "SILVER" ? "SILVER" : "YELLOW",
      netWeightMg: 1000,
      variants: {
        create: {
          sku: `${RUN}-P${n}`.toUpperCase(),
          priceInPaise: price,
          stock: opts.stock ?? 5,
          netWeightMg: 1000,
          images: [],
        },
      },
    },
    include: { variants: true },
  });
}
type P = Awaited<ReturnType<typeof product>>;

async function order(
  items: P[],
  opts: {
    status?: "PAID" | "DELIVERED" | "CANCELLED" | "PENDING" | "CONFIRMED";
    ageDays?: number;
    qty?: number;
  } = {},
) {
  const createdAt = new Date(Date.now() - (opts.ageDays ?? 0) * DAY);
  const status = opts.status ?? "PAID";
  return db.order.create({
    data: {
      userId,
      status,
      createdAt,
      paidAt: ["PAID", "DELIVERED"].includes(status) ? createdAt : null,
      subtotalInPaise: 1,
      totalInPaise: 1,
      addressSnapshot: {},
      items: {
        create: items.map((p) => ({
          productId: p.id,
          variantId: p.variants[0]!.id,
          productName: p.name,
          productSlug: p.slug,
          priceInPaise: p.priceInPaise,
          quantity: opts.qty ?? 1,
          lineTotalInPaise: p.priceInPaise * (opts.qty ?? 1),
          productSnapshot: {},
        })),
      },
    },
  });
}

const pairs = async (p: P) =>
  Object.fromEntries(
    (await db.productPair.findMany({ where: { productId: p.id } })).map((r) => [
      r.relatedId,
      r.orders,
    ]),
  );

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: `${RUN} rings`, slug: `${RUN}-rings` } }))
    .id;
  otherCategoryId = (
    await db.category.create({ data: { name: `${RUN} earrings`, slug: `${RUN}-ear` } })
  ).id;
  userId = (await db.user.create({ data: { email: `${RUN}@example.com` } })).id;
});

afterAll(async () => {
  await db.order.deleteMany({ where: { userId } });
  await db.recoStat.deleteMany({
    where: {
      widget: { in: ["similar", "trending", "upsell", "recent", "bought_together"] },
      day: { gte: new Date(Date.now() - 2 * DAY) },
    },
  });
  await db.product.deleteMany({ where: { slug: { startsWith: RUN } } });
  await db.category.deleteMany({ where: { id: { in: [categoryId, otherCategoryId] } } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.appSetting.deleteMany({ where: { key: "reco.computedAt" } });
  await db.$disconnect();
});

describe("nightly job", () => {
  let ring: P, chain: P, earring: P, lonely: P;
  beforeAll(async () => {
    [ring, chain, earring, lonely] = [
      await product(),
      await product(),
      await product(),
      await product(),
    ];
    await order([ring, chain]);
    await order([ring, chain], { status: "DELIVERED", ageDays: 30 });
    await order([ring, earring], { status: "CONFIRMED" }); // COD counts
    await order([ring, lonely], { status: "CANCELLED" }); // doesn't
    await order([ring, lonely], { status: "PENDING" }); // doesn't (never paid)
    await order([ring, lonely], { ageDays: 400 }); // too old
  });

  it("counts orders containing both products, in both directions, only real purchases", async () => {
    const r = await reco.computeRecommendations();
    expect(r.skipped).toBe(false);
    expect(await pairs(ring)).toEqual({ [chain.id]: 2, [earring.id]: 1 });
    expect(await pairs(chain)).toEqual({ [ring.id]: 2 });
    expect(await pairs(lonely)).toEqual({});
  });

  it("is idempotent: a second run gives exactly the same rows", async () => {
    const snapshot = async () =>
      (
        await db.productPair.findMany({ orderBy: [{ productId: "asc" }, { relatedId: "asc" }] })
      ).map(({ productId, relatedId, orders }) => [productId, relatedId, orders]);
    const first = await snapshot();
    const trendsFirst = await db.productTrend.findMany({ orderBy: { productId: "asc" } });
    await reco.computeRecommendations();
    expect(await snapshot()).toEqual(first);
    expect(
      (await db.productTrend.findMany({ orderBy: { productId: "asc" } })).map((t) => [
        t.productId,
        t.score,
      ]),
    ).toEqual(trendsFirst.map((t) => [t.productId, t.score]));
  });

  it("a run that starts while another is still running skips (no doubled or half-built rows)", async () => {
    // Deterministic overlap: hold the job's lock from another connection, as a running job would.
    const skipped = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(25025)`;
      return reco.computeRecommendations();
    });
    expect(skipped.skipped).toBe(true);
    expect(await pairs(ring)).toEqual({ [chain.id]: 2, [earring.id]: 1 });
    // And two at once from the outside still end with the right rows.
    await Promise.all([reco.computeRecommendations(), reco.computeRecommendations()]);
    expect(await pairs(ring)).toEqual({ [chain.id]: 2, [earring.id]: 1 });
  });

  it("trending: recent sales weigh more, older than 14 days don't count", async () => {
    const a = await product();
    const b = await product();
    await order([a], { qty: 1, ageDays: 0 }); // 14
    await order([b], { qty: 3, ageDays: 10 }); // 3 × 4 = 12
    await order([b], { qty: 9, ageDays: 20 }); // 0
    await reco.computeRecommendations();
    const score = async (p: P) =>
      (await db.productTrend.findUnique({ where: { productId: p.id } }))?.score;
    expect(await score(a)).toBe(14);
    expect(await score(b)).toBe(12);
  });

  it("the cron runs it at most once a day", async () => {
    await reco.computeRecommendations();
    expect(await reco.recoIsDue()).toBe(false);
    expect(await reco.recoIsDue(new Date(Date.now() + 21 * 3_600_000))).toBe(true);
  });
});

describe("widgets show sensible items", () => {
  it("bought together: hidden or sold-out pieces never show", async () => {
    const [main, ok, hidden, soldOut] = [
      await product(),
      await product(),
      await product({ active: false }),
      await product({ stock: 0 }),
    ];
    await order([main, ok, hidden, soldOut]);
    await reco.computeRecommendations();
    expect((await reco.getBoughtTogether(main.id)).map((c) => c.slug)).toEqual([ok.slug]);
  });

  it("similar: same category, closest price first; never the product itself", async () => {
    const target = await product({ price: 20_000_00 });
    const near = await product({ price: 21_000_00 });
    const far = await product({ price: 90_000_00 });
    const otherCat = await product({ price: 20_000_00, category: otherCategoryId });
    const slugs = (await reco.getSimilar(target.id, 50)).map((c) => c.slug);
    expect(slugs).not.toContain(target.slug);
    expect(slugs.indexOf(near.slug)).toBeLessThan(slugs.indexOf(far.slug));
    expect(slugs.indexOf(far.slug)).toBeLessThan(slugs.indexOf(otherCat.slug));
  });

  it("trending is never empty on a new store (topped up with the newest pieces)", async () => {
    const items = await reco.getTrending(8);
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((i) => i.slug)).size).toBe(items.length);
  });

  it("free-shipping upsell: covers the gap, cheapest first, nothing already in the cart", async () => {
    const gap = 7_77_700; // ₹7,777 — unusual so only our products sit right above it
    const cheapest = await product({ price: gap + 100 });
    const next = await product({ price: gap + 200 });
    const inCart = await product({ price: gap + 50 });
    await product({ price: gap - 1 }); // doesn't cover the gap
    const slugs = (await reco.getFreeShippingUpsell(gap, [inCart.id], 2)).map((c) => c.slug);
    expect(slugs).toEqual([cheapest.slug, next.slug]);
    expect(await reco.getFreeShippingUpsell(0, [])).toEqual([]);
  });

  it("recently viewed keeps the shopper's order and skips the current and hidden pieces", async () => {
    const [a, b, hidden] = [await product(), await product(), await product({ active: false })];
    const items = await reco.getRecentlyViewed([b.slug, hidden.slug, a.slug, "nope"], a.slug);
    expect(items.map((i) => i.slug)).toEqual([b.slug]);
  });
});

describe("tracking", () => {
  it("50 parallel clicks are all counted (sharded counters, no lost updates)", async () => {
    const before = (await reco.recoReport(1)).find((r) => r.widget === "upsell")!.clicks;
    await Promise.all(Array.from({ length: 50 }, () => reco.recordRecoEvent("upsell", "click")));
    expect((await reco.recoReport(1)).find((r) => r.widget === "upsell")!.clicks).toBe(before + 50);
  });

  it("purchases are credited only for paid orders and only for products the widget led to", async () => {
    const [x, y] = [await product({ price: 5_000_00 }), await product({ price: 3_000_00 })];
    const before = (await reco.recoReport(1)).find((r) => r.widget === "similar")!;
    const paid = await order([x, y]);
    const pending = await order([x], { status: "PENDING" });
    const attribution = { [x.id]: "similar" as const, ["cnotinorder000000"]: "trending" as const };
    await reco.attributeOrder(paid.id, userId, attribution);
    await reco.attributeOrder(pending.id, userId, attribution);
    // Someone else's order can't be tagged.
    const stranger = (await db.user.create({ data: { email: `${RUN}-x@example.com` } })).id;
    await reco.attributeOrder(paid.id, stranger, { [y.id]: "similar" });
    await db.user.delete({ where: { id: stranger } });

    expect((await db.order.findUniqueOrThrow({ where: { id: paid.id } })).recoAttribution).toEqual({
      [x.id]: "similar",
    });
    const after = (await reco.recoReport(1)).find((r) => r.widget === "similar")!;
    expect(after.purchases - before.purchases).toBe(1);
    expect(after.revenueInPaise - before.revenueInPaise).toBe(5_000_00);
  });
});
