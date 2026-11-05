import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { Prisma, type ContentStatus } from "@prisma/client";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { clearMemo, memo } from "@/lib/memo";
import {
  hasAnyRule,
  isLive,
  parseDateRange,
  readRules,
  STARTER_COLLECTIONS,
  type CollectionRules,
} from "@/lib/merch";
import { checkPreviewToken } from "@/lib/preview";
import { PAGE_SIZE } from "@/lib/validation/catalog";
import type {
  AnnouncementFormInput,
  CollectionFormInput,
  ContentPageFormInput,
  HomeSectionFormInput,
} from "@/lib/validation/content";
import { CATALOG_TAG, cardSelect, toCard } from "@/services/catalog.service";
import type { ProductCardData, ProductListResult } from "@/types/catalog";

/**
 * Merchandising and CMS (Phase 24): collections, homepage sections, announcement bar,
 * editable pages.
 *
 * Scheduling: the cached reads return every PUBLISHED row with its dates; whether something is
 * live is decided on each request with isLive(now). So a banner scheduled for Diwali morning
 * appears at that minute and disappears when it ends — no deploy, no background job. Saving
 * anything in admin refreshes the cache straight away (revalidateTag).
 */
export const CONTENT_TAG = "content";
const CACHE_SECONDS = 300;

export class ContentInputError extends Error {}

/** unstable_cache stores JSON, so dates come back as strings: turn them back into Dates. */
function asDate(v: Date | string | null): Date | null {
  return v === null ? null : new Date(v);
}
function live(
  row: { status: ContentStatus; startsAt: Date | string | null; endsAt: Date | string | null },
  now: Date,
) {
  return isLive(
    { status: row.status, startsAt: asDate(row.startsAt), endsAt: asDate(row.endsAt) },
    now,
  );
}

// ───────────────────────── storefront reads ─────────────────────────

const getPublished = memo(
  "content:getPublished",
  unstable_cache(
    async () => {
      const [announcements, sections] = await Promise.all([
        db.announcement.findMany({
          where: { status: "PUBLISHED" },
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            message: true,
            linkUrl: true,
            linkLabel: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
        }),
        db.homeSection.findMany({
          where: { status: "PUBLISHED" },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        }),
      ]);
      return { announcements, sections };
    },
    ["content:published:v1"],
    { tags: [CONTENT_TAG], revalidate: CACHE_SECONDS },
  ),
);

export interface LiveAnnouncement {
  id: string;
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
}

/** The announcement bar: the live one with the highest priority, or null. */
export async function getLiveAnnouncement(now = new Date()): Promise<LiveAnnouncement | null> {
  const { announcements } = await getPublished();
  const a = announcements.find((x) => live(x, now));
  return a ? { id: a.id, message: a.message, linkUrl: a.linkUrl, linkLabel: a.linkLabel } : null;
}

export interface LiveSection {
  id: string;
  kind: "HERO" | "PRODUCTS" | "BANNER" | "TEXT";
  title: string;
  subtitle: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  imageDesktop: string | null;
  imageMobile: string | null;
  collectionSlug: string | null;
  products: ProductCardData[];
}

/**
 * Homepage sections that are live now. Empty = the built-in homepage shows instead.
 * A products row whose collection isn't live (or has no products) is skipped.
 */
export async function getLiveHomeSections(
  now = new Date(),
  opts: { preview?: boolean } = {},
): Promise<LiveSection[]> {
  // Preview (signed link from Admin → Content): drafts and scheduled sections too, uncached.
  const sections = opts.preview
    ? await db.homeSection.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] })
    : (await getPublished()).sections.filter((x) => live(x, now));
  const out: LiveSection[] = [];
  for (const s of sections) {
    let products: ProductCardData[] = [];
    let collectionSlug: string | null = null;
    if (s.kind === "PRODUCTS") {
      const c = s.collectionId ? await getCollectionById(s.collectionId) : null;
      if (!c || (!opts.preview && !live(c, now))) continue;
      products = (await collectionProducts(c.id, c.kind, c.rules, 1, 8)).items;
      if (products.length === 0) continue;
      collectionSlug = c.slug;
    }
    out.push({
      id: s.id,
      kind: s.kind,
      title: s.title,
      subtitle: s.subtitle,
      body: s.body,
      linkUrl: s.linkUrl ?? (collectionSlug ? `/collections/${collectionSlug}` : null),
      linkLabel: s.linkLabel ?? (collectionSlug ? "See all" : null),
      imageDesktop: s.imageDesktop,
      imageMobile: s.imageMobile,
      collectionSlug,
      products,
    });
  }
  return out;
}

const collectionFields = {
  id: true,
  slug: true,
  title: true,
  description: true,
  seoTitle: true,
  seoDescription: true,
  image: true,
  kind: true,
  rules: true,
  status: true,
  startsAt: true,
  endsAt: true,
  updatedAt: true,
} satisfies Prisma.CollectionSelect;

const getCollectionBySlugCached = unstable_cache(
  async (slug: string) => db.collection.findUnique({ where: { slug }, select: collectionFields }),
  ["content:collection-slug:v1"],
  { tags: [CONTENT_TAG], revalidate: CACHE_SECONDS },
);

const getCollectionById = unstable_cache(
  async (id: string) => db.collection.findUnique({ where: { id }, select: collectionFields }),
  ["content:collection-id:v1"],
  { tags: [CONTENT_TAG], revalidate: CACHE_SECONDS },
);

export type CollectionView = NonNullable<Awaited<ReturnType<typeof getCollectionBySlugCached>>> & {
  isPreview: boolean;
};

/**
 * A collection for its page: live now, or a draft/scheduled one opened with a valid preview
 * link. Anything else → null (the page shows 404, same as an unknown slug).
 */
export async function getCollectionForPage(
  slug: string,
  previewToken?: string | null,
  now = new Date(),
): Promise<CollectionView | null> {
  const c = await getCollectionBySlugCached(slug);
  if (!c) return null;
  if (live(c, now)) return { ...c, isPreview: false };
  if (checkPreviewToken("collection", c.id, previewToken)) return { ...c, isPreview: true };
  return null;
}

/** Products of a rule collection: every rule must match. Prices in rupees. */
export function rulesToWhere(r: CollectionRules, now = new Date()): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (r.categorySlug) and.push({ category: { slug: r.categorySlug } });
  if (r.metalType) and.push({ metalType: r.metalType });
  if (r.purity) and.push({ purity: r.purity as Prisma.ProductWhereInput["purity"] });
  if (r.tags?.length) and.push({ tags: { hasSome: r.tags } });
  if (r.minPrice !== undefined) and.push({ priceInPaise: { gte: r.minPrice * 100 } });
  if (r.maxPrice !== undefined) and.push({ priceInPaise: { lte: r.maxPrice * 100 } });
  if (r.onSale) and.push({ compareAtPriceInPaise: { not: null } });
  if (r.newWithinDays)
    and.push({ createdAt: { gte: new Date(now.getTime() - r.newWithinDays * 86_400_000) } });
  return { AND: and };
}

const ACTIVE_PRODUCT: Prisma.ProductWhereInput = { isActive: true, category: { isActive: true } };

/** Products in a collection, paginated. Hidden products never show. */
const collectionProducts = unstable_cache(
  async (
    collectionId: string,
    kind: "MANUAL" | "RULE",
    rulesJson: Prisma.JsonValue,
    page: number,
    pageSize: number = PAGE_SIZE,
  ): Promise<ProductListResult> => {
    const skip = (page - 1) * pageSize;
    let where: Prisma.ProductWhereInput;
    let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "asc" }];
    if (kind === "RULE") {
      const rules = readRules(rulesJson);
      // Unreadable or empty rules match nothing, never "the whole store".
      if (!rules || !hasAnyRule(rules)) return { items: [], total: 0, page: 1, pageCount: 1 };
      where = { ...ACTIVE_PRODUCT, ...rulesToWhere(rules) };
    } else {
      where = { ...ACTIVE_PRODUCT, collections: { some: { collectionId } } };
    }
    if (kind === "MANUAL") {
      // Hand-picked order: read the positions, then fetch that page of products.
      const links = await db.collectionProduct.findMany({
        where: { collectionId, product: ACTIVE_PRODUCT },
        orderBy: [{ position: "asc" }, { productId: "asc" }],
        select: { productId: true },
      });
      const ids = links.slice(skip, skip + pageSize).map((l) => l.productId);
      const rows = await db.product.findMany({
        where: { id: { in: ids } },
        select: { ...cardSelect, id: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return {
        items: ids.flatMap((id) => (byId.has(id) ? [toCard(byId.get(id)!)] : [])),
        total: links.length,
        page,
        pageCount: Math.max(1, Math.ceil(links.length / pageSize)),
      };
    }
    orderBy = [{ isFeatured: "desc" }, ...orderBy];
    const [total, rows] = await db.$transaction([
      db.product.count({ where }),
      db.product.findMany({ where, select: cardSelect, orderBy, skip, take: pageSize }),
    ]);
    return {
      items: rows.map(toCard),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  },
  ["content:collection-products:v1"],
  { tags: [CONTENT_TAG, CATALOG_TAG], revalidate: CACHE_SECONDS },
);

export function getCollectionProducts(c: CollectionView, page: number) {
  return collectionProducts(c.id, c.kind, c.rules, page);
}

/** Live collections, for the sitemap and the admin "products row" picker. */
export async function listLiveCollections(now = new Date()) {
  const rows = await db.collection.findMany({
    where: { status: "PUBLISHED" },
    select: {
      slug: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      updatedAt: true,
    },
    orderBy: { title: "asc" },
  });
  return rows.filter((r) => live(r, now));
}

const getPageCached = unstable_cache(
  async (slug: string) => db.contentPage.findUnique({ where: { slug } }),
  ["content:page:v1"],
  { tags: [CONTENT_TAG], revalidate: CACHE_SECONDS },
);

/**
 * An editable page: the published text for everyone; with a valid preview link, the draft.
 * Never-published pages without a preview link → null (404).
 */
export async function getContentPage(slug: string, previewToken?: string | null) {
  const p = await getPageCached(slug);
  if (!p) return null;
  if (checkPreviewToken("page", p.id, previewToken))
    return { title: p.title, body: p.draftBody, seoDescription: p.seoDescription, isPreview: true };
  if (p.status !== "PUBLISHED") return null;
  return { title: p.title, body: p.body, seoDescription: p.seoDescription, isPreview: false };
}

export async function listPublishedPages() {
  return db.contentPage.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, title: true, publishedAt: true },
    orderBy: { title: "asc" },
  });
}

// ───────────────────────── admin ─────────────────────────

const FESTIVAL_NAMES = {
  akshaya_tritiya: "Akshaya Tritiya",
  dhanteras: "Dhanteras",
  diwali: "Diwali",
  wedding_season: "Wedding season",
} as const;

/** One-click date ranges for the schedule pickers, from config.ini [festivals]. */
export function festivalPresets(): { name: string; from: string; to: string }[] {
  return Object.entries(FESTIVAL_NAMES).flatMap(([key, name]) => {
    const range = parseDateRange(config.festivals[key as keyof typeof FESTIVAL_NAMES] ?? "");
    return range ? [{ name, ...range }] : [];
  });
}

function refresh() {
  revalidateTag(CONTENT_TAG);
  clearMemo("content:");
}

export async function adminListContent() {
  const [collections, sections, announcements, pages] = await Promise.all([
    db.collection.findMany({
      orderBy: [{ updatedAt: "desc" }],
      include: { _count: { select: { products: true } } },
    }),
    db.homeSection.findMany({
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { collection: { select: { title: true } } },
    }),
    db.announcement.findMany({ orderBy: [{ priority: "desc" }, { updatedAt: "desc" }] }),
    db.contentPage.findMany({ orderBy: { title: "asc" } }),
  ]);
  return { collections, sections, announcements, pages };
}

export async function adminGetCollection(id: string) {
  return db.collection.findUnique({
    where: { id },
    include: {
      products: {
        orderBy: [{ position: "asc" }, { productId: "asc" }],
        select: { product: { select: { slug: true, name: true, isActive: true } } },
      },
    },
  });
}

/** Saves a collection. The URL must not clash with a category (both live under /collections). */
export async function saveCollection(input: CollectionFormInput) {
  const clash = await db.category.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (clash) throw new ContentInputError(`"${input.slug}" is already a category's address.`);
  if (input.kind === "RULE" && !hasAnyRule(input.rules))
    throw new ContentInputError("Add at least one rule, or the collection would be empty.");
  if (input.rules.categorySlug) {
    const cat = await db.category.findUnique({ where: { slug: input.rules.categorySlug } });
    if (!cat)
      throw new ContentInputError(`No category with the address "${input.rules.categorySlug}".`);
  }
  const data = {
    slug: input.slug,
    title: input.title,
    description: input.description,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    image: input.image,
    kind: input.kind,
    rules: input.rules as Prisma.InputJsonValue,
    status: input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
  try {
    const saved = input.id
      ? await db.collection.update({ where: { id: input.id }, data, select: { id: true } })
      : await db.collection.create({ data, select: { id: true } });
    refresh();
    return saved;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new ContentInputError(`Another collection already uses "${input.slug}".`);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      throw new ContentInputError("That collection no longer exists.");
    throw error;
  }
}

/**
 * Hand-picked products, in order (replaces the list). Unknown slugs are reported back so a
 * typo doesn't silently drop a product.
 */
export async function setCollectionProducts(collectionId: string, slugs: string[]) {
  const products = await db.product.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(products.map((p) => [p.slug, p.id]));
  const missing = slugs.filter((s) => !bySlug.has(s));
  if (missing.length)
    throw new ContentInputError(`No product with the address: ${missing.slice(0, 5).join(", ")}`);
  await db.$transaction(async (tx) => {
    const c = await tx.collection.findUnique({
      where: { id: collectionId },
      select: { kind: true },
    });
    if (!c) throw new ContentInputError("That collection no longer exists.");
    if (c.kind !== "MANUAL")
      throw new ContentInputError("Rule-based collections pick products by their rules.");
    await tx.collectionProduct.deleteMany({ where: { collectionId } });
    await tx.collectionProduct.createMany({
      data: slugs.map((s, position) => ({ collectionId, productId: bySlug.get(s)!, position })),
    });
  });
  refresh();
  return slugs.length;
}

export async function deleteCollection(id: string) {
  await db.collection.deleteMany({ where: { id } });
  refresh();
}

/** The four occasion collections (Bridal, Daily Wear, Festive, Gifts), as drafts. Safe to repeat. */
export async function createStarterCollections() {
  let created = 0;
  for (const s of STARTER_COLLECTIONS) {
    const exists = await db.collection.findUnique({
      where: { slug: s.slug },
      select: { id: true },
    });
    const clash = await db.category.findUnique({ where: { slug: s.slug }, select: { id: true } });
    if (exists || clash) continue;
    await db.collection
      .create({
        data: {
          slug: s.slug,
          title: s.title,
          description: s.blurb,
          kind: "RULE",
          rules: { tags: [...s.tags] },
          status: "DRAFT",
        },
      })
      .then(() => created++)
      .catch((e) => {
        // Two clicks at once: the other one created it.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      });
  }
  refresh();
  return created;
}

export async function saveHomeSection(input: HomeSectionFormInput) {
  if (input.collectionId) {
    const c = await db.collection.findUnique({
      where: { id: input.collectionId },
      select: { id: true },
    });
    if (!c) throw new ContentInputError("That collection no longer exists.");
  }
  const { id, ...data } = input;
  const saved = id
    ? await db.homeSection.update({ where: { id }, data, select: { id: true } }).catch(notFound)
    : await db.homeSection.create({ data, select: { id: true } });
  refresh();
  return saved;
}

export async function deleteHomeSection(id: string) {
  await db.homeSection.deleteMany({ where: { id } });
  refresh();
}

export async function saveAnnouncement(input: AnnouncementFormInput) {
  const { id, ...data } = input;
  const saved = id
    ? await db.announcement.update({ where: { id }, data, select: { id: true } }).catch(notFound)
    : await db.announcement.create({ data, select: { id: true } });
  refresh();
  return saved;
}

export async function deleteAnnouncement(id: string) {
  await db.announcement.deleteMany({ where: { id } });
  refresh();
}

/** Saves the draft only — customers keep seeing the published text until "Publish". */
export async function savePageDraft(input: ContentPageFormInput) {
  const { id, ...data } = input;
  try {
    const saved = id
      ? await db.contentPage.update({ where: { id }, data, select: { id: true } })
      : await db.contentPage.create({ data, select: { id: true } });
    refresh();
    return saved;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new ContentInputError(`Another page already uses "${input.slug}".`);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      throw new ContentInputError("That page no longer exists.");
    throw error;
  }
}

export async function publishPage(id: string) {
  const page = await db.contentPage.findUnique({ where: { id }, select: { draftBody: true } });
  if (!page) throw new ContentInputError("That page no longer exists.");
  if (!page.draftBody.trim()) throw new ContentInputError("Write something before publishing.");
  await db.contentPage.update({
    where: { id },
    data: { body: page.draftBody, status: "PUBLISHED", publishedAt: new Date() },
  });
  refresh();
}

export async function unpublishPage(id: string) {
  await db.contentPage.updateMany({ where: { id }, data: { status: "DRAFT" } });
  refresh();
}

export async function deletePage(id: string) {
  await db.contentPage.deleteMany({ where: { id } });
  refresh();
}

function notFound(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
    throw new ContentInputError("That item no longer exists (someone may have deleted it).");
  throw error;
}
