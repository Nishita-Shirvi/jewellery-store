/**
 * Customer support (Phase 22) — pure rules, no database, so they're unit-tested.
 */

export const MAX_ATTACHMENTS = 2;
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
export const MAX_MESSAGE_CHARS = 5000;
/** A ticket waiting this long for the store's first/next reply is highlighted. */
export const REPLY_DUE_MS = 24 * 60 * 60_000;

export type AttachmentType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** Decides the type from the file's first bytes (never trusts the name or the browser). */
export function sniffAttachment(bytes: Uint8Array): AttachmentType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return "image/png";
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (b.length >= 5 && String.fromCharCode(...b.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

const EXT: Record<AttachmentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * A safe file name for storage and download: letters, digits, dot, dash, underscore; the
 * extension always matches the real type (so "photo.jpg.exe" or "x.svg" can't sneak through).
 */
export function safeFilename(name: string, type: AttachmentType): string {
  const base = name
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${base || "attachment"}.${EXT[type]}`;
}

/**
 * Is the customer waiting too long? Open tickets whose latest customer message hasn't been
 * answered within 24 hours.
 */
export function isOverdue(
  ticket: { status: string; lastCustomerMessageAt: Date; lastStaffReplyAt: Date | null },
  now = new Date(),
): boolean {
  if (ticket.status !== "OPEN") return false;
  const answered =
    ticket.lastStaffReplyAt !== null && ticket.lastStaffReplyAt >= ticket.lastCustomerMessageAt;
  return !answered && now.getTime() - ticket.lastCustomerMessageAt.getTime() > REPLY_DUE_MS;
}

/** "Chat on WhatsApp" link, or null when no number is set (feature off). */
export function whatsappLink(number: string, text: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export const TICKET_CATEGORY_LABEL = {
  ORDER: "My order",
  DELIVERY: "Delivery",
  RETURN: "Return or refund",
  PAYMENT: "Payment",
  PRODUCT: "A product",
  OTHER: "Something else",
} as const;

export const TICKET_STATUS_LABEL = {
  OPEN: "Waiting for us",
  ANSWERED: "Answered",
  RESOLVED: "Resolved",
} as const;

export const displayTicketNumber = (id: string) => `#T-${id.slice(-6).toUpperCase()}`;
