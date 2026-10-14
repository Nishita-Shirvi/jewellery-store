import Link from "next/link";
import Image from "next/image";
import { Stars } from "@/components/reviews/stars";
import { ReviewForm } from "@/components/reviews/review-form";
import { formatRating, type ReviewSort } from "@/lib/reviews";
import { cn } from "@/lib/utils";
import { canReview, getMyReview, listApprovedReviews } from "@/services/review.service";
import { isUploadConfigured } from "@/services/upload.service";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const SORT_LABEL: Record<ReviewSort, string> = {
  newest: "Newest",
  highest: "Highest rated",
  lowest: "Lowest rated",
};

export async function ReviewSection({
  product,
  viewerId,
  sort,
  page,
}: {
  product: { id: string; slug: string; reviewCount: number; ratingAvgX100: number };
  viewerId: string | null;
  sort: ReviewSort;
  page: number;
}) {
  const [{ reviews, total, pageCount, counts }, eligible, mine] = await Promise.all([
    listApprovedReviews(product.id, sort, page),
    viewerId ? canReview(viewerId, product.id) : Promise.resolve(false),
    viewerId ? getMyReview(viewerId, product.id) : Promise.resolve(null),
  ]);
  const href = (s: ReviewSort, p = 1) =>
    `/products/${product.slug}?reviews=${s}${p > 1 ? `&rpage=${p}` : ""}#reviews`;

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="border-border mt-16 border-t pt-10"
    >
      <h2 id="reviews-heading" className="text-3xl">
        Reviews
      </h2>

      <div className="mt-6 grid gap-10 md:grid-cols-[260px_1fr]">
        <div>
          {product.reviewCount > 0 ? (
            <>
              <p
                className="text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
                data-testid="rating-average"
              >
                {formatRating(product.ratingAvgX100)}
              </p>
              <Stars avgX100={product.ratingAvgX100} size={18} />
              <p className="text-muted-foreground mt-1 text-sm" data-testid="rating-count">
                Based on {product.reviewCount} {product.reviewCount === 1 ? "review" : "reviews"}
              </p>
              <ul className="mt-4 space-y-1 text-xs" aria-label="Rating breakdown">
                {([5, 4, 3, 2, 1] as const).map((r) => (
                  <li key={r} className="flex items-center gap-2">
                    <span className="w-10">{r} star</span>
                    <span className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-gold block h-full"
                        style={{
                          width: `${product.reviewCount ? (counts[r] / product.reviewCount) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <span className="text-muted-foreground w-6 text-right">{counts[r]}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No reviews yet.</p>
          )}
        </div>

        <div className="space-y-6">
          {/* Who can write a review */}
          {mine && mine.status !== "APPROVED" && (
            <p className="bg-accent rounded-md p-3 text-sm" data-testid="my-review-status">
              {mine.status === "PENDING"
                ? "Your review is waiting for approval."
                : `Your review wasn't published${mine.adminNote ? `: ${mine.adminNote}` : "."} You can edit and resubmit it.`}
            </p>
          )}
          {eligible ? (
            <details open={!mine} className="group">
              <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">
                {mine ? "Edit your review" : "Write a review"}
              </summary>
              <div className="mt-4">
                <ReviewForm
                  productId={product.id}
                  slug={product.slug}
                  uploadEnabled={isUploadConfigured()}
                  initial={
                    mine
                      ? {
                          rating: mine.rating,
                          title: mine.title,
                          body: mine.body,
                          images: mine.images,
                        }
                      : undefined
                  }
                />
              </div>
            </details>
          ) : viewerId ? (
            <p className="text-muted-foreground text-sm">
              Reviews are written by customers who have received this piece.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(`/products/${product.slug}#reviews`)}`}
                className="underline"
              >
                Log in
              </Link>{" "}
              to review a piece you&apos;ve bought.
            </p>
          )}

          {total > 0 && (
            <nav aria-label="Sort reviews" className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(SORT_LABEL) as ReviewSort[]).map((s) => (
                <Link
                  key={s}
                  href={href(s)}
                  scroll={false}
                  aria-current={s === sort ? "true" : undefined}
                  className={cn(
                    "border-border rounded-md border px-3 py-1",
                    s === sort && "bg-primary text-primary-foreground border-primary",
                  )}
                >
                  {SORT_LABEL[s]}
                </Link>
              ))}
            </nav>
          )}

          <ul className="divide-border divide-y" aria-label="Customer reviews">
            {reviews.map((r) => (
              <li key={r.id} className="py-5" data-testid="review">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars avgX100={r.rating * 100} />
                  <p className="font-semibold">{r.title}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{r.body}</p>
                {r.images.length > 0 && (
                  <ul className="mt-3 flex gap-2">
                    {r.images.map((src) => (
                      <li key={src}>
                        <Image
                          src={src}
                          alt="Customer photo"
                          width={72}
                          height={72}
                          className="border-border rounded border object-cover"
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-muted-foreground mt-2 text-xs">
                  {r.authorName}, verified buyer, {dateFmt.format(r.createdAt)}
                </p>
              </li>
            ))}
          </ul>

          {pageCount > 1 && (
            <nav aria-label="Review pages" className="flex items-center gap-3 text-sm">
              {page > 1 && (
                <Link href={href(sort, page - 1)} scroll={false} className="underline">
                  Previous
                </Link>
              )}
              <span className="text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              {page < pageCount && (
                <Link href={href(sort, page + 1)} scroll={false} className="underline">
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
