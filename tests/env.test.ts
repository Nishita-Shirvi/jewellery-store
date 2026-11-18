import { describe, expect, it } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
const { productionProblems } = await import("@/lib/env");

describe("productionProblems", () => {
  const good = { CRON_SECRET: "x".repeat(20) };

  it("ignores everything outside the real production deployment", () => {
    expect(productionProblems({}, { VERCEL_ENV: "preview" })).toEqual([]);
    expect(productionProblems({}, {})).toEqual([]);
  });

  it("accepts a correct production setup", () => {
    expect(
      productionProblems(good, {
        VERCEL_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://shop.example.in",
      }),
    ).toEqual([]);
  });

  it("flags localhost links, a missing cron secret and test API overrides", () => {
    const problems = productionProblems(
      { RAZORPAY_API_BASE: "http://localhost:4010" },
      { VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
    );
    expect(problems).toHaveLength(3);
  });
});
