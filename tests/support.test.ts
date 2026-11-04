import { describe, expect, it } from "vitest";
import {
  REPLY_DUE_MS,
  displayTicketNumber,
  isOverdue,
  safeFilename,
  sniffAttachment,
  whatsappLink,
} from "@/lib/support";

const bytes = (...b: (number | string)[]) =>
  new Uint8Array(
    b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])),
  );

describe("attachment type comes from the bytes", () => {
  it.each([
    ["jpeg", bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0), "image/jpeg"],
    ["png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0), "image/png"],
    ["webp", bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "), "image/webp"],
    ["pdf", bytes("%PDF-1.7\n"), "application/pdf"],
  ])("%s", (_n, b, type) => expect(sniffAttachment(b)).toBe(type));

  it.each([
    ["svg (can carry script)", bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>')],
    ["html", bytes("<!doctype html><script>alert(1)</script>")],
    ["exe", bytes("MZ", 0x90, 0)],
    ["zip", bytes("PK", 3, 4)],
    ["gif", bytes("GIF89a")],
    ["empty", bytes()],
    ["truncated png", bytes(0x89, "PN")],
  ])("refuses %s", (_n, b) => expect(sniffAttachment(b)).toBeNull());
});

describe("safe file names", () => {
  it("keeps a readable name and forces the real extension", () => {
    expect(safeFilename("broken clasp photo.JPG", "image/jpeg")).toBe("broken-clasp-photo.jpg");
    expect(safeFilename("invoice.pdf.exe", "application/pdf")).toBe("invoice.pdf.pdf");
    expect(safeFilename("x.svg", "image/png")).toBe("x.png");
  });
  it("strips paths, quotes and control characters (no header or path tricks)", () => {
    expect(safeFilename('../../etc/"passwd"\r\n.png', "image/png")).toMatch(
      /^[A-Za-z0-9._-]+\.png$/,
    );
    expect(safeFilename("", "image/webp")).toBe("attachment.webp");
    expect(safeFilename("........", "image/webp")).toBe("attachment.webp");
    expect(safeFilename("a".repeat(500), "image/png").length).toBeLessThanOrEqual(64);
  });
});

describe("waiting more than 24 h", () => {
  const now = new Date("2026-11-04T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it("open and unanswered for over a day → highlighted", () => {
    expect(
      isOverdue(
        { status: "OPEN", lastCustomerMessageAt: ago(REPLY_DUE_MS + 1), lastStaffReplyAt: null },
        now,
      ),
    ).toBe(true);
  });
  it("not yet a day, answered after the customer's last message, or not open → not highlighted", () => {
    expect(
      isOverdue(
        { status: "OPEN", lastCustomerMessageAt: ago(REPLY_DUE_MS - 1000), lastStaffReplyAt: null },
        now,
      ),
    ).toBe(false);
    expect(
      isOverdue(
        {
          status: "OPEN",
          lastCustomerMessageAt: ago(2 * REPLY_DUE_MS),
          lastStaffReplyAt: ago(REPLY_DUE_MS),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isOverdue(
        {
          status: "RESOLVED",
          lastCustomerMessageAt: ago(9 * REPLY_DUE_MS),
          lastStaffReplyAt: null,
        },
        now,
      ),
    ).toBe(false);
  });
  it("customer wrote again after our reply, a day ago → highlighted again", () => {
    expect(
      isOverdue(
        {
          status: "OPEN",
          lastCustomerMessageAt: ago(REPLY_DUE_MS + 1),
          lastStaffReplyAt: ago(3 * REPLY_DUE_MS),
        },
        now,
      ),
    ).toBe(true);
  });
});

describe("WhatsApp button", () => {
  it("only with a plausible number; text is encoded", () => {
    expect(whatsappLink("", "hi")).toBeNull();
    expect(whatsappLink("12345", "hi")).toBeNull();
    expect(whatsappLink("+91 98765 43210", "Order #A&B")).toBe(
      "https://wa.me/919876543210?text=Order%20%23A%26B",
    );
  });
  it("ticket numbers are short and stable", () => {
    expect(displayTicketNumber("cmabcdefghijkl")).toBe("#T-GHIJKL");
  });
});
