import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { db } = await import("@/lib/db");
const { reindexSearchText, searchProductScores, suggestProducts } =
  await import("@/services/search.service");

async function names(q: string) {
  const scores = await searchProductScores(q, 10);
  const rows = await db.product.findMany({
    where: { id: { in: [...scores.keys()] } },
    select: { id: true, name: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return [...scores.keys()].map((id) => byId.get(id)!);
}

beforeAll(async () => {
  await reindexSearchText();
});
afterAll(async () => db.$disconnect());

describe("product search (seeded catalogue, real Postgres + pg_trgm)", () => {
  it.each([
    ["jumka", "Traditional Jhumka"], // missing letter
    ["jhumka", "Traditional Jhumka"],
    ["solitare ring", "Classic Solitaire Ring"], // typo + second word
    ["emrald", "Emerald Drop Earrings"],
    ["mangalsutra", "Classic Mangalsutra"],
    ["kada", "Men's Gold Kada"],
  ])("%s → %s first", async (q, expected) => {
    expect((await names(q))[0]).toBe(expected);
  });

  it("matches metal, purity and category words", async () => {
    expect(await names("rose gold")).toEqual(
      expect.arrayContaining([
        "Infinity Ring",
        "Heart Pendant with Chain",
        "Rose Gold Chain Bracelet",
      ]),
    );
    expect((await names("925")).length).toBeGreaterThanOrEqual(5);
    expect(await names("gold bangle")).toEqual(
      expect.arrayContaining(["Plain Gold Bangles (pair)"]),
    );
  });

  it("every word must match; nonsense finds nothing; SQL-ish input is harmless", async () => {
    expect(await names("xyzzy")).toEqual([]);
    expect(await names("ruby kada")).toEqual([]);
    expect(await names('\'; drop table "Product"; --')).toEqual([]);
    expect(await names("%_%")).toEqual([]);
    expect(await db.product.count()).toBeGreaterThan(0);
  });

  it("suggestions return names, links and prices", async () => {
    const s = await suggestProducts("jhum");
    expect(s[0]).toMatchObject({ name: "Traditional Jhumka", slug: "traditional-jhumka" });
    expect(s[0]!.priceInPaise).toBeGreaterThan(0);
  });
});
