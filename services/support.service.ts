import "server-only";
import type { Prisma, TicketCategory, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_CHARS,
  isOverdue,
  safeFilename,
  sniffAttachment,
} from "@/lib/support";
import { enqueue, kickJobs } from "@/services/jobs.service";

/**
 * Customer support (Phase 22): tickets with threads, private attachments, FAQs, canned replies.
 *
 * Customers only ever reach their OWN tickets (every query filters by userId) and never see
 * internal staff notes. Attachments live in the database and are only served by
 * /api/support/attachments/[id] after the same checks. Emails go through the job queue.
 */

export class SupportError extends Error {}

type Tx = Prisma.TransactionClient;

export interface UploadedFile {
  filename: string;
  contentType: string;
  size: number;
  data: Buffer;
}

/** Validates uploaded files by their bytes: at most 2, 2 MB each, JPG/PNG/WebP/PDF only. */
export async function readAttachments(files: File[]): Promise<UploadedFile[]> {
  const real = files.filter((f) => f.size > 0);
  if (real.length > MAX_ATTACHMENTS)
    throw new SupportError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
  const out: UploadedFile[] = [];
  for (const file of real) {
    if (file.size > MAX_ATTACHMENT_BYTES)
      throw new SupportError(`"${file.name.slice(0, 40)}" is larger than 2 MB.`);
    const data = Buffer.from(await file.arrayBuffer());
    const type = sniffAttachment(data);
    if (!type) throw new SupportError("Only photos (JPG, PNG, WebP) or PDF files can be attached.");
    out.push({
      filename: safeFilename(file.name, type),
      contentType: type,
      size: data.length,
      data,
    });
  }
  return out;
}

function checkBody(body: string): string {
  const text = body.trim();
  if (text.length < 2) throw new SupportError("Please write a message.");
  if (text.length > MAX_MESSAGE_CHARS)
    throw new SupportError(`Messages can be up to ${MAX_MESSAGE_CHARS} characters.`);
  return text;
}

async function addMessage(
  tx: Tx,
  input: {
    ticketId: string;
    authorId: string;
    fromStaff: boolean;
    internal?: boolean;
    body: string;
    files: UploadedFile[];
  },
) {
  const message = await tx.ticketMessage.create({
    data: {
      ticketId: input.ticketId,
      authorId: input.authorId,
      fromStaff: input.fromStaff,
      internal: input.internal ?? false,
      body: input.body,
    },
    select: { id: true },
  });
  if (input.files.length)
    await tx.ticketAttachment.createMany({
      data: input.files.map((f) => ({
        ticketId: input.ticketId,
        messageId: message.id,
        filename: f.filename,
        contentType: f.contentType,
        size: f.size,
        data: new Uint8Array(f.data),
      })),
    });
  return message.id;
}

// ───────────────────────── customers ─────────────────────────

export async function createTicket(
  userId: string,
  input: {
    subject: string;
    category: TicketCategory;
    orderId?: string;
    body: string;
    files: UploadedFile[];
  },
): Promise<string> {
  const subject = input.subject.trim();
  if (subject.length < 3 || subject.length > 120)
    throw new SupportError("Give your question a short title (3–120 characters).");
  const body = checkBody(input.body);
  if (input.orderId) {
    const own = await db.order.count({ where: { id: input.orderId, userId } });
    if (!own) throw new SupportError("That order isn't on your account.");
  }
  const ticketId = await db.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: { userId, subject, category: input.category, orderId: input.orderId ?? null },
      select: { id: true },
    });
    const messageId = await addMessage(tx, {
      ticketId: ticket.id,
      authorId: userId,
      fromStaff: false,
      body,
      files: input.files,
    });
    await enqueue(
      "email.marketing",
      { kind: "ticket_staff_alert", ticketId: ticket.id, messageId },
      { tx },
    );
    return ticket.id;
  });
  await kickJobs();
  logger.info("support.ticket_created", { ticketId, userId });
  return ticketId;
}

export async function listTicketsForUser(userId: string) {
  return db.supportTicket.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      status: true,
      category: true,
      updatedAt: true,
      orderId: true,
    },
  });
}

/** The customer's own ticket, without internal notes. Null if it isn't theirs. */
export async function getTicketForUser(userId: string, ticketId: string) {
  return db.supportTicket.findFirst({
    where: { id: ticketId, userId },
    include: {
      messages: {
        where: { internal: false },
        orderBy: { createdAt: "asc" },
        include: {
          attachments: { select: { id: true, filename: true, contentType: true, size: true } },
        },
      },
      order: { select: { id: true } },
    },
  });
}

export async function customerReply(
  userId: string,
  ticketId: string,
  bodyInput: string,
  files: UploadedFile[],
) {
  const body = checkBody(bodyInput);
  const messageId = await db.$transaction(async (tx) => {
    // Conditional on ownership: another customer's ticket id simply matches nothing.
    const res = await tx.supportTicket.updateMany({
      where: { id: ticketId, userId },
      data: { status: "OPEN", lastCustomerMessageAt: new Date(), resolvedAt: null },
    });
    if (res.count === 0) throw new SupportError("Ticket not found.");
    const id = await addMessage(tx, { ticketId, authorId: userId, fromStaff: false, body, files });
    await enqueue(
      "email.marketing",
      { kind: "ticket_staff_alert", ticketId, messageId: id },
      { tx },
    );
    return id;
  });
  await kickJobs();
  return messageId;
}

export async function customerResolve(userId: string, ticketId: string) {
  const res = await db.supportTicket.updateMany({
    where: { id: ticketId, userId, status: { not: "RESOLVED" } },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  return res.count === 1;
}

// ───────────────────────── staff ─────────────────────────

export type InboxFilter = { status?: TicketStatus | "ALL"; who?: "me" | "unassigned" | "all" };

export async function listTicketsAdmin(filter: InboxFilter, staffId: string, now = new Date()) {
  const where: Prisma.SupportTicketWhereInput = {
    ...(filter.status && filter.status !== "ALL"
      ? { status: filter.status }
      : filter.status === "ALL"
        ? {}
        : { status: { not: "RESOLVED" } }),
    ...(filter.who === "me"
      ? { assignedToId: staffId }
      : filter.who === "unassigned"
        ? { assignedToId: null }
        : {}),
  };
  const rows = await db.supportTicket.findMany({
    where,
    orderBy: { lastCustomerMessageAt: "asc" },
    take: 200,
    select: {
      id: true,
      subject: true,
      status: true,
      category: true,
      lastCustomerMessageAt: true,
      lastStaffReplyAt: true,
      updatedAt: true,
      user: { select: { email: true, name: true } },
      assignedTo: { select: { email: true, name: true } },
      orderId: true,
    },
  });
  // Customers waiting longest without an answer first.
  return rows
    .map((t) => ({ ...t, overdue: isOverdue(t, now) }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue));
}

export async function getTicketAdmin(ticketId: string) {
  return db.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      assignedTo: { select: { id: true, email: true, name: true } },
      order: { select: { id: true, status: true, totalInPaise: true, createdAt: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: { select: { id: true, filename: true, contentType: true, size: true } },
        },
      },
    },
  });
}

/**
 * A staff reply (emailed to the customer) or an internal note (never shown or emailed).
 * `resolve` closes the ticket with the reply.
 */
export async function staffReply(
  staffId: string,
  ticketId: string,
  input: { body: string; internal: boolean; resolve: boolean; files: UploadedFile[] },
) {
  const body = checkBody(input.body);
  const now = new Date();
  await db.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) throw new SupportError("Ticket not found.");
    const messageId = await addMessage(tx, {
      ticketId,
      authorId: staffId,
      fromStaff: true,
      internal: input.internal,
      body,
      files: input.files,
    });
    if (input.internal) {
      await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: now } });
      return;
    }
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: input.resolve ? "RESOLVED" : "ANSWERED",
        lastStaffReplyAt: now,
        resolvedAt: input.resolve ? now : null,
      },
    });
    await enqueue(
      "email.marketing",
      { kind: "ticket_customer_update", ticketId, messageId },
      { tx },
    );
  });
  await kickJobs();
}

/** Assign to a staff member who can work on tickets (or nobody). */
export async function assignTicket(ticketId: string, assigneeId: string | null) {
  if (assigneeId) {
    const ok = await db.user.count({
      where: {
        id: assigneeId,
        role: "ADMIN",
        staffDeactivatedAt: null,
        staffRoles: {
          some: { role: { permissions: { some: { permissionKey: "support.manage" } } } },
        },
      },
    });
    if (!ok) throw new SupportError("That person can't work on support tickets.");
  }
  const res = await db.supportTicket.updateMany({
    where: { id: ticketId },
    data: { assignedToId: assigneeId },
  });
  if (res.count === 0) throw new SupportError("Ticket not found.");
}

export async function setTicketStatus(ticketId: string, status: TicketStatus) {
  const res = await db.supportTicket.updateMany({
    where: { id: ticketId },
    data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
  });
  if (res.count === 0) throw new SupportError("Ticket not found.");
}

export async function supportAgents() {
  return db.user.findMany({
    where: {
      role: "ADMIN",
      staffDeactivatedAt: null,
      staffRoles: {
        some: { role: { permissions: { some: { permissionKey: "support.manage" } } } },
      },
    },
    select: { id: true, email: true, name: true },
    orderBy: { email: "asc" },
  });
}

// ───────────────────────── attachments ─────────────────────────

/**
 * An attachment for someone allowed to see it: the ticket's customer (never one on an internal
 * note) or support staff. Null otherwise — same answer for "not found" and "not yours".
 */
export async function getAttachmentForViewer(
  attachmentId: string,
  viewer: { id: string; isSupportStaff: boolean },
) {
  const a = await db.ticketAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      ticket: { select: { userId: true } },
      message: { select: { internal: true } },
    },
  });
  if (!a) return null;
  if (viewer.isSupportStaff) return a;
  if (a.ticket.userId !== viewer.id || a.message.internal) return null;
  return a;
}

// ───────────────────────── FAQs and canned replies ─────────────────────────

export async function publishedFaqs(query?: string) {
  const words = (query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2)
    .slice(0, 6);
  return db.faq.findMany({
    where: {
      isPublished: true,
      AND: words.map((w) => ({
        OR: [
          { question: { contains: w, mode: "insensitive" as const } },
          { answer: { contains: w, mode: "insensitive" as const } },
          { category: { contains: w, mode: "insensitive" as const } },
        ],
      })),
    },
    orderBy: [{ category: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    take: 100,
  });
}

export async function listFaqsAdmin() {
  return db.faq.findMany({ orderBy: [{ category: "asc" }, { position: "asc" }] });
}

export async function saveFaq(input: {
  id?: string;
  question: string;
  answer: string;
  category: string;
  position: number;
  isPublished: boolean;
}) {
  const data = {
    question: input.question,
    answer: input.answer,
    category: input.category,
    position: input.position,
    isPublished: input.isPublished,
  };
  return input.id
    ? db.faq.update({ where: { id: input.id }, data, select: { id: true } })
    : db.faq.create({ data, select: { id: true } });
}

export async function deleteFaq(id: string) {
  await db.faq.deleteMany({ where: { id } });
}

export async function listCannedReplies() {
  return db.cannedReply.findMany({ orderBy: { title: "asc" } });
}

export async function saveCannedReply(input: { id?: string; title: string; body: string }) {
  return input.id
    ? db.cannedReply.update({
        where: { id: input.id },
        data: { title: input.title, body: input.body },
        select: { id: true },
      })
    : db.cannedReply.create({
        data: { title: input.title, body: input.body },
        select: { id: true },
      });
}

export async function deleteCannedReply(id: string) {
  await db.cannedReply.deleteMany({ where: { id } });
}
