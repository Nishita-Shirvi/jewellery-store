import { describe, expect, it } from "vitest";
import { placeDefault, sampleTile, zoomOrigin, type CategoryTile } from "@/lib/tiles";
import { categoryTileSchema, readTile } from "@/lib/validation/tiles";

describe("category tiles", () => {
  const valid: CategoryTile = sampleTile({ slug: "rings", name: "Rings" })!;

  it("picks the sample tile from the category's name (earrings before rings)", () => {
    expect(sampleTile({ slug: "earrings", name: "Earrings" })?.model).toBe("head");
    expect(sampleTile({ slug: "rings", name: "Rings" })?.model).toBe("hand");
    expect(sampleTile({ slug: "necklaces-pendants", name: "Necklaces & Pendants" })?.model).toBe(
      "bust",
    );
    expect(sampleTile({ slug: "bangles-bracelets", name: "Bangles & Bracelets" })?.rot).toBe(90);
    expect(sampleTile({ slug: "mangalsutra", name: "Mangalsutra" })?.piece).toContain(
      "mangalsutra",
    );
    expect(sampleTile({ slug: "nose-pins", name: "Nose pins" })).toBeNull();
    // Whole words only: no tile from "sets", "nose rings" or "string".
    expect(sampleTile({ slug: "gift-sets", name: "Gift sets" })).toBeNull();
    expect(sampleTile({ slug: "nose-rings", name: "Nose rings" })).toBeNull();
    expect(sampleTile({ slug: "toe-rings", name: "Toe rings" })).toBeNull();
    expect(sampleTile({ slug: "chandbali-earrings", name: "Chandbali Earrings" })?.model).toBe(
      "head",
    );
  });

  it("places a new piece on each model", () => {
    expect(placeDefault("head", 2)).toEqual({ w: 30, cx: 76, cy: 226, rot: 0 });
    expect(placeDefault("hand", 1)).toMatchObject({ cx: 168, w: 50 });
    expect(placeDefault("bust", 3).cy).toBe(254); // tall pieces are capped at 240 high
    // A very tall piece still lands on the model and can be saved.
    for (const model of ["head", "hand", "bust"] as const) {
      const p = placeDefault(model, 50);
      expect(p.cy).toBeLessThanOrEqual(380);
      expect(categoryTileSchema.safeParse({ ...valid, model, ...p, ar: 20 }).success).toBe(true);
    }
  });

  it("starts the hover zoom where the piece sits", () => {
    const t = sampleTile({ slug: "earrings", name: "Earrings" })!;
    expect(zoomOrigin(t)).toEqual({ "--ox": "25.33%", "--oy": "58.00%" });
    expect(zoomOrigin({ ...t, model: "photo", modelPhoto: "/images/x.jpg" })).toEqual({
      "--ox": "50%",
      "--oy": "45%",
    });
  });

  it("accepts the sample tiles", () => {
    for (const slug of ["earrings", "rings", "necklaces", "bangles", "chains", "mangalsutra"])
      expect(categoryTileSchema.safeParse(sampleTile({ slug, name: slug })).success, slug).toBe(
        true,
      );
  });

  it("refuses pictures from other websites and positions off the model", () => {
    expect(
      categoryTileSchema.safeParse({ ...valid, piece: "https://evil.example/p.png" }).success,
    ).toBe(false);
    expect(categoryTileSchema.safeParse({ ...valid, zoom: "javascript:alert(1)" }).success).toBe(
      false,
    );
    expect(categoryTileSchema.safeParse({ ...valid, cx: 999 }).success).toBe(false);
    expect(categoryTileSchema.safeParse({ ...valid, w: 1 }).success).toBe(false);
  });

  it("needs a piece on a velvet model (an empty model is never saved)", () => {
    expect(categoryTileSchema.safeParse({ ...valid, piece: "" }).success).toBe(false);
    expect(categoryTileSchema.safeParse({ ...valid, piece: "", model: "none" }).success).toBe(true);
  });

  it("needs a photo for the own-model-photo tile", () => {
    expect(categoryTileSchema.safeParse({ ...valid, model: "photo" }).success).toBe(false);
    expect(
      categoryTileSchema.safeParse({ ...valid, model: "photo", modelPhoto: "/images/m.jpg" })
        .success,
    ).toBe(true);
  });

  it("reads stored tiles safely", () => {
    expect(readTile(valid)).toEqual(valid);
    expect(readTile({ model: "bust" })).toBeNull();
    expect(readTile("nonsense")).toBeNull();
  });
});
