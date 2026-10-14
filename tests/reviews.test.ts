import { describe, expect, it } from "vitest";
import { formatRating, publicAuthorName, reviewSchema, starFill } from "@/lib/reviews";

describe("reviews", () => {
  it("shows only first name + initial", () => {
    expect(publicAuthorName("Priya Sharma")).toBe("Priya S.");
    expect(publicAuthorName("Anil Kumar Reddy")).toBe("Anil R.");
    expect(publicAuthorName("Meera")).toBe("Meera");
    expect(publicAuthorName(null)).toBe("Verified buyer");
  });
  it("formats averages", () => {
    expect(formatRating(467)).toBe("4.7");
    expect(formatRating(500)).toBe("5.0");
    expect(formatRating(0)).toBe("0.0");
  });
  it("draws half stars", () => {
    expect(starFill(450)).toEqual(["full", "full", "full", "full", "half"]);
    expect(starFill(420)).toEqual(["full", "full", "full", "full", "empty"]);
    expect(starFill(100)).toEqual(["full", "empty", "empty", "empty", "empty"]);
  });
  it("validates input", () => {
    const ok = {
      productId: "abc",
      rating: "5",
      title: "Lovely",
      body: "Beautiful finish and quick delivery.",
    };
    expect(reviewSchema.safeParse(ok).success).toBe(true);
    expect(reviewSchema.safeParse({ ...ok, rating: "6" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...ok, body: "short" }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...ok, images: ["https://evil.example/x.png"] }).success).toBe(
      false,
    );
  });
});
