import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const { db } = await import("@/lib/db");
const { moderateReview } = await import("@/services/review.service");

const RUN = `rev${Date.now().toString(36)}`;
let productId = "";
let categoryId = "";
const users: string[] = [];

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { name: RUN, slug: RUN } })).id;
  productId = (
    await db.product.create({
      data: {
        name: RUN,
        slug: RUN,
        description: "x",
        priceInPaise: 100,
        stock: 1,
        images: [],
        categoryId,
        metalType: "GOLD",
        purity: "K22",
        metalColour: "YELLOW",
        netWeightMg: 1000,
      },
    })
  ).id;
  for (let i = 0; i < 10; i++)
    users.push((await db.user.create({ data: { email: `${RUN}-${i}@example.com` } })).id);
});
afterAll(async () => {
  await db.review.deleteMany({ where: { productId } });
  await db.product.delete({ where: { id: productId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

describe("product rating stays exact (real database)", () => {
  it("10 reviews approved at the same moment → count 10, exact average", async () => {
    const ratings = [5, 5, 4, 4, 4, 3, 5, 2, 5, 4]; // sum 41 → 4.10
    const reviews = await Promise.all(
      users.map((userId, i) =>
        db.review.create({
          data: {
            productId,
            userId,
            rating: ratings[i]!,
            title: "t",
            body: "body text",
            authorName: "A",
          },
        }),
      ),
    );
    await Promise.all(reviews.map((r) => moderateReview(r.id, "APPROVED", "admin")));
    const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(p).toMatchObject({ reviewCount: 10, ratingSum: 41, ratingAvgX100: 410 });
  });

  it("unpublishing removes a review from the average", async () => {
    const lowest = await db.review.findFirstOrThrow({ where: { productId, rating: 2 } });
    await moderateReview(lowest.id, "REJECTED", "admin", "test");
    const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
    expect(p).toMatchObject({ reviewCount: 9, ratingSum: 39, ratingAvgX100: 433 });
  });
});
