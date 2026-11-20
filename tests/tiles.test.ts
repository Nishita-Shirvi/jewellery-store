import { describe, expect, it } from "vitest";
import { placeDefault, sampleTile, zoomOrigin, type CategoryTile } from "@/lib/tiles";
import { categoryTileSchema, readTile } from "@/lib/validation/tiles";

describe("category tiles", () => {
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
  });

  it("places a new piece on each model", () => {
    expect(placeDefault("head", 2)).toEqual({ w: 30, cx: 76, cy: 226, rot: 0 });
    expect(placeDefault("hand", 1)).toMatchObject({ cx: 168, w: 50 });
    expect(placeDefault("bust", 3).cy).toBe(254); // tall pieces are capped at 240 high
  });

  it("starts the hover zoom where the piece sits", () => {
    const t = sampleTile({ slug: "earrings", name: "Earrings" })!;
    expect(zoomOrigin(t)).toEqual({ "--ox": "25.33%", "--oy": "58.00%" });
    expect(zoomOrigin({ ...t, model: "photo", modelPhoto: "/images/x.jpg" })).toEqual({
      "--ox": "50%",
      "--oy": "45%",
    });
  });

  const valid: CategoryTile = sampleTile({ slug: "rings", name: "Rings" })!;

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
