import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Phase 24 — merchandising and CMS against a real PostgreSQL database: sale prices kept in
 * sync, collections (hand-picked and rule-based), scheduling by date, preview links, page
 * draft/publish, and address clashes with categories.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

const { db } = await import("@/lib/db");
const merch = await import("@/services/merch.service");
const variantAdmin = await import("@/services/admin/variant-admin.service");
const { makePreviewToken } = await import("@/lib/preview");

const RUN = `mc${Date.now().toString(36)}`;
let categoryId = "";
let categorySlug = "";
let seq = 0;

async function product(opts: {
  prices: number[];
  tags?: string[];
  metal?: "GOLD" | "SILVER";
  active?: boolean;
}) {
  const n = ++seq;
  return db.product.create({
    data: {
      name: `${RUN} piece ${n}`,
      slug: `${RUN}-p${n}`,
      description: "test",
      priceInPaise: Math.min(...opts.prices),
      images: ["/x.svg"],
      categoryId,
      metalType: opts.metal ?? "GOLD",
      purity: opts.metal === "SILVER" ? "S925" : "K22",
      metalColour: opts.metal === "SILVER" ? "SILVER" : "YELLOW",
      netWeightMg: 1000,
      stock: 5 * opts.prices.length,
      isActive: opts.active ?? true,
      tags: opts.tags ?? [],
      variants: {
        create: opts.prices.map((price, i) => ({
          sku: `${RUN}-P${n}-V${i}`.toUpperCase(),
          optionKey: opts.prices.length === 1 ? "" : `k${i}`,
          label: opts.prices.length === 1 ? "" : `Size ${i}`,
          priceInPaise: price,
          stock: 5,
          netWeightMg: 1000,
          images: [],
          position: i,
        })),
      },
    },
    include: { variants: { orderBy: { position: "asc" } } },
  });
}

const minute = 60_000;
const ago = (ms: number) => new Date(Date.now() - ms);
const later = (ms: number) => new Date(Date.now() + ms);

async function collection(data: Partial<Parameters<typeof db.collection.create>[0]["data"]>) {
  return db.collection.create({
    data: {
      slug: `${RUN}-c${++seq}`,
      title: "Test collection",
      kind: "MANUAL",
      status: "PUBLISHED",
      ...data,
    },
  });
}

beforeAll(async () => {
  categorySlug = `${RUN}-cat`;
  categoryId = (await db.category.create({ data: { name: `${RUN} category`, slug: categorySlug } }))
    .id;
});

afterAll(async () => {
  await db.homeSection.deleteMany({ where: { title: { startsWith: RUN } } });
  await db.announcement.deleteMany({ where: { message: { startsWith: RUN } } });
  await db.collection.deleteMany({ where: { slug: { startsWith: RUN } } });
  await db.contentPage.deleteMany({ where: { slug: { startsWith: RUN } } });
  await db.product.deleteMany({ where: { slug: { startsWith: RUN } } });
  await db.category.deleteMany({ where: { id: categoryId } });
  await db.$disconnect();
});

describe('sale ("was") prices', () => {
  it("the card's was-price belongs to the variant giving the 'from' price", async () => {
    const p = await product({ prices: [50_000_00, 40_000_00] });
    const [big, small] = p.variants;
    const rows = (wasBig: number | null, wasSmall: number | null) => [
      {
        id: big!.id,
        sku: big!.sku,
        priceInPaise: 50_000_00,
        compareAtPriceInPaise: wasBig,
        stock: 5,
        netWeightMg: 1000,
        grossWeightMg: null,
        isActive: true,
      },
      {
        id: small!.id,
        sku: small!.sku,
        priceInPaise: 40_000_00,
        compareAtPriceInPaise: wasSmall,
        stock: 5,
        netWeightMg: 1000,
        grossWeightMg: null,
        isActive: true,
      },
    ];
    // Only the dearer size is on sale: the card (showing the cheaper "from" price) gets no badge.
    await variantAdmin.bulkUpdateVariants(p.id, rows(60_000_00, null), "test");
    let after = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.priceInPaise).toBe(40_000_00);
    expect(after.compareAtPriceInPaise).toBeNull();
    // The cheaper size goes on sale too → badge from that size.
    await variantAdmin.bulkUpdateVariants(p.id, rows(60_000_00, 50_000_00), "test");
    after = await db.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.compareAtPriceInPaise).toBe(50_000_00);
  });

  it("a was-price at or below the price is refused and nothing changes", async () => {
    const p = await product({ prices: [10_000_00] });
    const v = p.variants[0]!;
    await expect(
      variantAdmin.bulkUpdateVariants(
        p.id,
        [
          {
            id: v.id,
            sku: v.sku,
            priceInPaise: 10_000_00,
            compareAtPriceInPaise: 10_000_00,
            stock: 5,
            netWeightMg: 1000,
            grossWeightMg: null,
            isActive: true,
          },
        ],
        "test",
      ),
    ).rejects.toThrow(/higher than the price/);
    expect(
      (await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).compareAtPriceInPaise,
    ).toBeNull();
  });

  it("older callers that don't send a was-price leave it alone", async () => {
    const p = await product({ prices: [10_000_00] });
    const v = p.variants[0]!;
    await db.productVariant.update({
      where: { id: v.id },
      data: { compareAtPriceInPaise: 12_000_00 },
    });
    await variantAdmin.bulkUpdateVariants(
      p.id,
      [
        {
          id: v.id,
          sku: v.sku,
          priceInPaise: 10_000_00,
          stock: 7,
          netWeightMg: 1000,
          grossWeightMg: null,
          isActive: true,
        },
      ],
      "test",
    );
    expect(
      (await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).compareAtPriceInPaise,
    ).toBe(12_000_00);
  });
});

describe("collections", () => {
  it("hand-picked: in the chosen order, hidden products skipped, typos reported", async () => {
    const [a, b, hidden] = [
      await product({ prices: [100_00] }),
      await product({ prices: [200_00] }),
      await product({ prices: [300_00], active: false }),
    ];
    const c = await collection({ kind: "MANUAL" });
    await merch.setCollectionProducts(c.id, [b.slug, hidden.slug, a.slug]);
    const view = (await merch.getCollectionForPage(c.slug))!;
    const page = await merch.getCollectionProducts(view, 1);
    expect(page.items.map((i) => i.slug)).toEqual([b.slug, a.slug]);
    expect(page.total).toBe(2);
    await expect(merch.setCollectionProducts(c.id, [a.slug, "no-such-ring"])).rejects.toThrow(
      /no-such-ring/,
    );
    // The failed save changed nothing.
    expect((await merch.getCollectionProducts(view, 1)).items).toHaveLength(2);
  });

  it("rule-based: every rule must match; empty or broken rules match nothing", async () => {
    const goldBridal = await product({ prices: [40_000_00], tags: ["bridal", RUN] });
    await product({ prices: [40_000_00], tags: ["bridal", RUN], metal: "SILVER" });
    await product({ prices: [90_000_00], tags: ["bridal", RUN] }); // too dear
    await product({ prices: [40_000_00], tags: ["daily-wear", RUN] }); // wrong tag
    const c = await collection({
      kind: "RULE",
      rules: { tags: ["bridal"], metalType: "GOLD", maxPrice: 50_000, categorySlug },
    });
    const view = (await merch.getCollectionForPage(c.slug))!;
    expect((await merch.getCollectionProducts(view, 1)).items.map((i) => i.slug)).toEqual([
      goldBridal.slug,
    ]);

    for (const rules of [{}, { metalType: "WOOD" }, "garbage"]) {
      const bad = await collection({ kind: "RULE", rules });
      const badView = (await merch.getCollectionForPage(bad.slug))!;
      expect((await merch.getCollectionProducts(badView, 1)).total).toBe(0);
    }
  });

  it("'on sale' rule picks only products with a was-price", async () => {
    const sale = await product({ prices: [5_000_00], tags: [`${RUN}-sale`] });
    await db.product.update({ where: { id: sale.id }, data: { compareAtPriceInPaise: 6_000_00 } });
    await product({ prices: [5_000_00], tags: [`${RUN}-sale`] });
    const c = await collection({ kind: "RULE", rules: { tags: [`${RUN}-sale`], onSale: true } });
    const view = (await merch.getCollectionForPage(c.slug))!;
    const items = (await merch.getCollectionProducts(view, 1)).items;
    expect(items.map((i) => i.slug)).toEqual([sale.slug]);
    expect(items[0]).toMatchObject({ compareAtPriceInPaise: 6_000_00, percentOff: 16 });
  });

  it("saving: rule collections need a rule; addresses can't clash with categories or each other", async () => {
    const base = {
      id: undefined,
      title: "X",
      description: "",
      seoTitle: null,
      seoDescription: null,
      image: null,
      status: "DRAFT" as const,
      startsAt: null,
      endsAt: null,
    };
    await expect(
      merch.saveCollection({ ...base, slug: `${RUN}-empty`, kind: "RULE", rules: {} }),
    ).rejects.toThrow(/at least one rule/);
    await expect(
      merch.saveCollection({ ...base, slug: categorySlug, kind: "MANUAL", rules: {} }),
    ).rejects.toThrow(/already a category/);
    await merch.saveCollection({ ...base, slug: `${RUN}-dup`, kind: "MANUAL", rules: {} });
    await expect(
      merch.saveCollection({ ...base, slug: `${RUN}-dup`, kind: "MANUAL", rules: {} }),
    ).rejects.toThrow(/already uses/);
  });

  it("starter occasion collections: created once, as drafts, even if clicked twice at once", async () => {
    const before = await db.collection.count({
      where: { slug: { in: ["bridal", "daily-wear", "festive", "gifts"] } },
    });
    await Promise.all([merch.createStarterCollections(), merch.createStarterCollections()]);
    const rows = await db.collection.findMany({
      where: { slug: { in: ["bridal", "daily-wear", "festive", "gifts"] } },
    });
    expect(rows).toHaveLength(4);
    if (before === 0) {
      expect(rows.every((r) => r.status === "DRAFT" && r.kind === "RULE")).toBe(true);
      await db.collection.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    }
  });
});

describe("scheduling: live on its dates, without a deploy", () => {
  it("a collection scheduled for later is hidden until then, and gone after it ends", async () => {
    const future = await collection({ startsAt: later(60 * minute) });
    const ended = await collection({ startsAt: ago(120 * minute), endsAt: ago(minute) });
    const running = await collection({ startsAt: ago(minute), endsAt: later(60 * minute) });
    const draft = await collection({ status: "DRAFT" });
    expect(await merch.getCollectionForPage(future.slug)).toBeNull();
    expect(await merch.getCollectionForPage(ended.slug)).toBeNull();
    expect(await merch.getCollectionForPage(draft.slug)).toBeNull();
    expect(await merch.getCollectionForPage(running.slug)).toMatchObject({ isPreview: false });
    // Time moves on: the same rows, judged at a later "now".
    expect(await merch.getCollectionForPage(future.slug, null, later(61 * minute))).not.toBeNull();
    expect(await merch.getCollectionForPage(running.slug, null, later(61 * minute))).toBeNull();
  });

  it("preview links open drafts and scheduled collections — only the one they were made for", async () => {
    const draft = await collection({ status: "DRAFT" });
    const other = await collection({ status: "DRAFT" });
    const token = makePreviewToken("collection", draft.id);
    expect(await merch.getCollectionForPage(draft.slug, token)).toMatchObject({ isPreview: true });
    expect(await merch.getCollectionForPage(other.slug, token)).toBeNull();
  });

  it("announcement bar: the live one with the highest priority", async () => {
    await db.announcement.createMany({
      data: [
        {
          message: `${RUN} low`,
          status: "PUBLISHED",
          priority: 99,
          startsAt: ago(minute),
          endsAt: later(30 * minute),
        },
        {
          message: `${RUN} high later`,
          status: "PUBLISHED",
          priority: 100,
          startsAt: later(10 * minute),
        },
        { message: `${RUN} draft`, status: "DRAFT", priority: 100 },
      ],
    });
    // Other tests' announcements may exist in the shared DB: only check ours win when they should.
    const now = await merch.getLiveAnnouncement();
    expect(now?.message).toBe(`${RUN} low`);
    expect((await merch.getLiveAnnouncement(later(11 * minute)))?.message).toBe(
      `${RUN} high later`,
    );
  });

  it("homepage: only live sections; a products row whose collection isn't live is skipped", async () => {
    const p = await product({ prices: [100_00] });
    const liveC = await collection({});
    const laterC = await collection({ startsAt: later(60 * minute) });
    await merch.setCollectionProducts(liveC.id, [p.slug]);
    await merch.setCollectionProducts(laterC.id, [p.slug]);
    await db.homeSection.createMany({
      data: [
        { kind: "TEXT", title: `${RUN} text`, status: "PUBLISHED", position: 900 },
        {
          kind: "PRODUCTS",
          title: `${RUN} live row`,
          collectionId: liveC.id,
          status: "PUBLISHED",
          position: 901,
        },
        {
          kind: "PRODUCTS",
          title: `${RUN} later row`,
          collectionId: laterC.id,
          status: "PUBLISHED",
          position: 902,
        },
        {
          kind: "TEXT",
          title: `${RUN} tomorrow`,
          status: "PUBLISHED",
          position: 903,
          startsAt: later(24 * 60 * minute),
        },
        { kind: "TEXT", title: `${RUN} draft`, status: "DRAFT", position: 904 },
      ],
    });
    const titles = (await merch.getLiveHomeSections())
      .map((s) => s.title)
      .filter((t) => t.startsWith(RUN));
    expect(titles).toEqual([`${RUN} text`, `${RUN} live row`]);
    const row = (await merch.getLiveHomeSections()).find((s) => s.title === `${RUN} live row`)!;
    expect(row.products.map((x) => x.slug)).toEqual([p.slug]);
    expect(row.linkUrl).toBe(`/collections/${liveC.slug}`);
    // Preview shows everything, drafts included.
    const preview = (await merch.getLiveHomeSections(new Date(), { preview: true }))
      .map((s) => s.title)
      .filter((t) => t.startsWith(RUN));
    expect(preview).toEqual([
      `${RUN} text`,
      `${RUN} live row`,
      `${RUN} later row`,
      `${RUN} tomorrow`,
      `${RUN} draft`,
    ]);
  });
});

describe("editable pages: draft → publish", () => {
  it("customers see the published text; edits stay private until published again", async () => {
    const { id } = await merch.savePageDraft({
      title: "Care",
      slug: `${RUN}-care`,
      draftBody: "v1",
      seoDescription: null,
    });
    expect(await merch.getContentPage(`${RUN}-care`)).toBeNull(); // never published
    expect(await merch.getContentPage(`${RUN}-care`, makePreviewToken("page", id))).toMatchObject({
      body: "v1",
      isPreview: true,
    });
    await merch.publishPage(id);
    await merch.savePageDraft({
      id,
      title: "Care",
      slug: `${RUN}-care`,
      draftBody: "v2 secret",
      seoDescription: null,
    });
    expect(await merch.getContentPage(`${RUN}-care`)).toMatchObject({
      body: "v1",
      isPreview: false,
    });
    await merch.publishPage(id);
    expect((await merch.getContentPage(`${RUN}-care`))?.body).toBe("v2 secret");
    await merch.unpublishPage(id);
    expect(await merch.getContentPage(`${RUN}-care`)).toBeNull();
  });

  it("empty drafts can't be published; addresses are unique", async () => {
    const { id } = await merch.savePageDraft({
      title: "Empty",
      slug: `${RUN}-empty`,
      draftBody: "  ",
      seoDescription: null,
    });
    await expect(merch.publishPage(id)).rejects.toThrow(/Write something/);
    await expect(
      merch.savePageDraft({
        title: "Again",
        slug: `${RUN}-empty`,
        draftBody: "x",
        seoDescription: null,
      }),
    ).rejects.toThrow(/already uses/);
  });
});
