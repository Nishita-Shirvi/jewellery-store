import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENTRANCE,
  DEFAULT_POSTER,
  DEFAULT_VIDEO,
  entranceTagline,
  entranceVideo,
} from "@/lib/entrance";
import { entranceSchema, storedEntranceSchema } from "@/lib/validation/entrance";

describe("sign-in video and top bar", () => {
  it("defaults: our showroom clip plays and the tagline shows", () => {
    expect(entranceSchema.safeParse(DEFAULT_ENTRANCE).success).toBe(true);
    expect(entranceVideo(DEFAULT_ENTRANCE)).toBe(DEFAULT_VIDEO);
    expect(entranceTagline(DEFAULT_ENTRANCE)).toBe("A little gold. A lifetime of stories.");
  });

  it("switching off hides the video and the bar", () => {
    expect(entranceVideo({ ...DEFAULT_ENTRANCE, video: false })).toBeNull();
    expect(entranceTagline({ ...DEFAULT_ENTRANCE, topBar: false })).toBeNull();
    expect(entranceTagline({ ...DEFAULT_ENTRANCE, tagline: "   " })).toBeNull();
  });

  it("accepts only videos and pictures on our site or storage", () => {
    const ok = (patch: object) => entranceSchema.safeParse({ ...DEFAULT_ENTRANCE, ...patch });
    expect(ok({ videoUrl: "/videos/other.webm" }).success).toBe(true);
    expect(ok({ videoUrl: "https://evil.example/clip.mp4" }).success).toBe(false);
    expect(ok({ videoUrl: "/videos/../secret.mp4" }).success).toBe(false);
    expect(ok({ poster: "https://evil.example/a.jpg" }).success).toBe(false);
    expect(ok({ poster: DEFAULT_POSTER }).success).toBe(true);
    // Stored rows are shape-only, so a bad link can still be opened and fixed in admin.
    expect(
      storedEntranceSchema.safeParse({ ...DEFAULT_ENTRANCE, poster: "https://evil.example/a.jpg" })
        .success,
    ).toBe(true);
  });

  it("needs a video when the video is on, and a tagline when the bar is on", () => {
    const res = entranceSchema.safeParse({ ...DEFAULT_ENTRANCE, videoUrl: "", tagline: "" });
    expect(res.success).toBe(false);
    const paths = res.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["videoUrl", "tagline"]));
    expect(
      entranceSchema.safeParse({
        ...DEFAULT_ENTRANCE,
        video: false,
        videoUrl: "",
        topBar: false,
        tagline: "",
      }).success,
    ).toBe(true);
  });

  it("keeps a heading and limits lengths", () => {
    expect(entranceSchema.safeParse({ ...DEFAULT_ENTRANCE, heading: " " }).success).toBe(false);
    expect(entranceSchema.safeParse({ ...DEFAULT_ENTRANCE, tagline: "x".repeat(81) }).success).toBe(
      false,
    );
  });
});

describe("sign-in settings messages", () => {
  it("an empty still asks for a picture, not a re-upload", () => {
    const res = entranceSchema.safeParse({ ...DEFAULT_ENTRANCE, poster: "" });
    expect(res.success).toBe(false);
    expect(res.error!.issues.map((i) => i.message)).toEqual(["Add a still picture"]);
  });
});
