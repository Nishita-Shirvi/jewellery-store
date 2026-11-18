import { describe, expect, it, vi } from "vitest";

process.env.CLOUDINARY_CLOUD_NAME = "ourshop";
vi.mock("@/lib/config", () => ({
  config: { images: { r2_public_url: "https://images.ourshop.in" } },
}));

const { isAllowedImageUrl, isAllowedVideoUrl } = await import("@/lib/media");

describe("isAllowedImageUrl", () => {
  it("accepts our own storage and built-in images", () => {
    expect(isAllowedImageUrl("/images/products/ring.svg")).toBe(true);
    expect(isAllowedImageUrl("https://res.cloudinary.com/ourshop/image/upload/v1/a.jpg")).toBe(
      true,
    );
    expect(isAllowedImageUrl("https://images.ourshop.in/jewellery-store/products/a.webp")).toBe(
      true,
    );
  });

  it("rejects other accounts, other hosts and tricks", () => {
    expect(isAllowedImageUrl("https://res.cloudinary.com/someoneelse/image/upload/a.jpg")).toBe(
      false,
    );
    expect(isAllowedImageUrl("https://images.ourshop.in.evil.com/a.jpg")).toBe(false);
    expect(isAllowedImageUrl("https://evil.example/a.jpg")).toBe(false);
    expect(isAllowedImageUrl('https://images.ourshop.in/a.jpg"onerror=x')).toBe(false);
    expect(isAllowedImageUrl("/images/../secret.png")).toBe(false);
    expect(isAllowedImageUrl("/images/ring.svg", { allowLocal: false })).toBe(false);
  });

  it("rejects ../ escapes out of our folder", () => {
    expect(
      isAllowedImageUrl(
        "https://res.cloudinary.com/ourshop/image/upload/../../../evil/image/upload/x.jpg",
        { allowLocal: false },
      ),
    ).toBe(false);
    expect(isAllowedImageUrl("https://images.ourshop.in/a/%2e%2e/b.jpg")).toBe(false);
  });

  it("keeps old Cloudinary product photos valid when the cloud name is removed (R2 move)", () => {
    const saved = process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    try {
      expect(isAllowedImageUrl("https://res.cloudinary.com/ourshop/image/upload/v1/a.jpg")).toBe(
        true,
      );
      // Customer uploads stay strict.
      expect(
        isAllowedImageUrl("https://res.cloudinary.com/ourshop/image/upload/v1/a.jpg", {
          allowLocal: false,
        }),
      ).toBe(false);
    } finally {
      process.env.CLOUDINARY_CLOUD_NAME = saved;
    }
  });
});

describe("isAllowedVideoUrl", () => {
  it("accepts mp4/webm from our storage only", () => {
    expect(isAllowedVideoUrl("/videos/ring-spin.mp4")).toBe(true);
    expect(isAllowedVideoUrl("https://res.cloudinary.com/ourshop/video/upload/v1/spin.mp4")).toBe(
      true,
    );
    expect(isAllowedVideoUrl("https://images.ourshop.in/spins/ring.webm")).toBe(true);
    expect(isAllowedVideoUrl("https://images.ourshop.in/spins/ring.mov")).toBe(false);
    expect(isAllowedVideoUrl("https://evil.example/spin.mp4")).toBe(false);
  });
});
