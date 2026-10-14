import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stars } from "@/components/reviews/stars";
import { listReviewsAdmin } from "@/services/review.service";
import { moderateReviewAction } from "../actions";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });
const FILTERS = [
  ["PENDING", "Waiting for review"],
  ["APPROVED", "Published"],
  ["REJECTED", "Rejected"],
] as const;

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const status = (await searchParams).status ?? "PENDING";
  const reviews = await listReviewsAdmin(status);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Reviews</h1>
      <nav aria-label="Filter reviews" className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/reviews?status=${value}`}
            aria-current={status === value ? "page" : undefined}
            className={`border-border rounded-md border px-3 py-1 ${status === value ? "bg-primary text-primary-foreground" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {reviews.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing here.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="border-border space-y-2 rounded-md border p-4 text-sm"
              data-testid="admin-review"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Stars avgX100={r.rating * 100} />
                <span className="font-semibold">{r.title}</span>
                <span className="text-muted-foreground">
                  on{" "}
                  <Link href={`/products/${r.product.slug}`} className="underline">
                    {r.product.name}
                  </Link>
                </span>
              </div>
              <p className="whitespace-pre-line">{r.body}</p>
              <p className="text-muted-foreground text-xs">
                {r.authorName} ({r.user.email}), {dateFmt.format(r.createdAt)}
                {r.images.length ? `, ${r.images.length} photo(s)` : ""}
              </p>
              {r.adminNote && <p className="text-xs">Note: {r.adminNote}</p>}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {r.status !== "APPROVED" && (
                  <form action={moderateReviewAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="APPROVED" />
                    <Button type="submit" size="sm">
                      Publish
                    </Button>
                  </form>
                )}
                {r.status !== "REJECTED" && (
                  <form action={moderateReviewAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="REJECTED" />
                    <Input
                      name="note"
                      placeholder="Reason (shown to the customer)"
                      aria-label="Reason for rejecting"
                      className="h-8 w-60"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      {r.status === "APPROVED" ? "Unpublish" : "Reject"}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
