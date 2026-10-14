import "server-only";
import { revalidateTag } from "next/cache";
import type { Prisma, ReviewStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  REVIEW_PAGE_SIZE,
  publicAuthorName,
  type ReviewInput,
  type ReviewSort,
} from "@/lib/reviews";
import { CATALOG_TAG } from "@/services/catalog.service";

type Tx = Prisma.TransactionClient;

export class ReviewError extends Error {}

/**
 * Locks the product row for the rest of the transaction. Must run BEFORE changing a review, so
 * simultaneous moderations queue up and each recalculation sees the previous one's committed
 * change (otherwise Postgres can recalculate from a stale snapshot and undercount — caught by a test).
 */
async function lockProduct(tx: Tx, productId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
}

/**
 * Recalculates a product's rating from its APPROVED reviews in one statement, inside the
 * caller's transaction — always exact, even when several moderation changes happen at once.
 */
export async function recalcProductRating(tx: Tx, productId: string) {
  await tx.$executeRaw`
    UPDATE "Product" p
       SET "reviewCount" = s.c,
           "ratingSum" = s.total,
           "ratingAvgX100" = CASE WHEN s.c = 0 THEN 0 ELSE ROUND(s.total * 100.0 / s.c)::int END
      FROM (SELECT COUNT(*)::int AS c, COALESCE(SUM("rating"), 0)::int AS total
              FROM "Review" WHERE "productId" = ${productId} AND "status" = 'APPROVED') s
     WHERE p."id" = ${productId}`;
}

/** Only customers with a delivered order containing the product may review it. */
export async function canReview(userId: string, productId: string): Promise<boolean> {
  const delivered = await db.orderItem.findFirst({
    where: { productId, order: { userId, deliveredAt: { not: null } } },
    select: { id: true },
  });
  return Boolean(delivered);
}

export async function getMyReview(userId: string, productId: string) {
  return db.review.findUnique({ where: { userId_productId: { userId, productId } } });
}

/** Creates or edits the customer's review. Any edit goes back to moderation (and out of the average). */
export async function submitReview(user: { id: string; name: string | null }, input: ReviewInput) {
  if (!(await canReview(user.id, input.productId))) {
    throw new ReviewError("Only customers who received this piece can review it.");
  }
  await db.$transaction(async (tx) => {
    await lockProduct(tx, input.productId);
    await tx.review.upsert({
      where: { userId_productId: { userId: user.id, productId: input.productId } },
      create: {
        userId: user.id,
        productId: input.productId,
        rating: input.rating,
        title: input.title,
        body: input.body,
        images: input.images,
        authorName: publicAuthorName(user.name),
      },
      update: {
        rating: input.rating,
        title: input.title,
        body: input.body,
        images: input.images,
        status: "PENDING",
        adminNote: null,
      },
    });
    await recalcProductRating(tx, input.productId);
  });
  revalidateTag(CATALOG_TAG);
  logger.info("review.submitted", { userId: user.id, productId: input.productId });
}

export async function moderateReview(
  reviewId: string,
  status: Exclude<ReviewStatus, "PENDING">,
  adminId: string,
  note?: string,
) {
  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { productId: true },
  });
  if (!review) throw new ReviewError("Review not found.");
  await db.$transaction(async (tx) => {
    await lockProduct(tx, review.productId);
    await tx.review.update({ where: { id: reviewId }, data: { status, adminNote: note ?? null } });
    await recalcProductRating(tx, review.productId);
  });
  revalidateTag(CATALOG_TAG);
  logger.info("review.moderated", { reviewId, status, adminId });
}

const ORDER: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  highest: [{ rating: "desc" }, { createdAt: "desc" }, { id: "asc" }],
  lowest: [{ rating: "asc" }, { createdAt: "desc" }, { id: "asc" }],
};

export async function listApprovedReviews(productId: string, sort: ReviewSort, page: number) {
  const where = { productId, status: "APPROVED" as const };
  const [total, reviews, breakdown] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: ORDER[sort],
      skip: (page - 1) * REVIEW_PAGE_SIZE,
      take: REVIEW_PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        images: true,
        authorName: true,
        createdAt: true,
      },
    }),
    db.review.groupBy({ by: ["rating"], where, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(
    [1, 2, 3, 4, 5].map((r) => [r, breakdown.find((b) => b.rating === r)?._count._all ?? 0]),
  );
  return {
    total,
    reviews,
    pageCount: Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE)),
    counts: counts as Record<1 | 2 | 3 | 4 | 5, number>,
  };
}

export async function listReviewsAdmin(status?: string) {
  const valid = ["PENDING", "APPROVED", "REJECTED"].includes(status ?? "")
    ? (status as ReviewStatus)
    : undefined;
  return db.review.findMany({
    where: valid ? { status: valid } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { product: { select: { name: true, slug: true } }, user: { select: { email: true } } },
  });
}
