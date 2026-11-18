import "server-only";
import type { VisitStatus } from "@prisma/client";
import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { istDay } from "@/lib/report/dates";
import { sendEmail } from "@/services/email.service";

/** Showroom visit requests from /visit (and the "Book a visit" link on product pages). */

export const VISIT_PAGE_SIZE = 25;
/** Furthest ahead a visit can be booked. */
export const VISIT_MAX_DAYS_AHEAD = 60;

export class VisitError extends Error {}

/** "2026-11-20" must be today (India time) or later, and within VISIT_MAX_DAYS_AHEAD. */
export function checkVisitDate(day: string, now = new Date()): Date {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new VisitError("Choose a valid date.");
  }
  const today = new Date(`${istDay(now)}T00:00:00.000Z`);
  if (date < today) throw new VisitError("Choose today or a later date.");
  if (date.getTime() - today.getTime() > VISIT_MAX_DAYS_AHEAD * 86_400_000) {
    throw new VisitError(`Choose a date within the next ${VISIT_MAX_DAYS_AHEAD} days.`);
  }
  return date;
}

export async function createVisitRequest(input: {
  name: string;
  phone: string;
  email: string | null;
  preferredDate: string;
  timeSlot: string;
  message: string | null;
  productSlug: string | null;
  userId: string | null;
}): Promise<{ id: string }> {
  const preferredDate = checkVisitDate(input.preferredDate);
  const product = input.productSlug
    ? await db.product.findFirst({
        where: { slug: input.productSlug, isActive: true },
        select: { id: true, name: true },
      })
    : null;

  const visit = await db.visitRequest.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      preferredDate,
      timeSlot: input.timeSlot,
      message: input.message,
      productId: product?.id ?? null,
      userId: input.userId,
    },
    select: { id: true },
  });
  logger.info("visit.requested", { visitId: visit.id, hasProduct: Boolean(product) });

  // Tell the shop. A failed email never loses the request: it's already saved and listed in admin.
  try {
    const recipients = config.alerts.admin_email
      ? [config.alerts.admin_email]
      : (await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true } })).map(
          (u) => u.email,
        );
    const link = `${publicEnv.NEXT_PUBLIC_APP_URL}/admin/visits`;
    const when = `${input.preferredDate}, ${input.timeSlot}`;
    for (const to of recipients) {
      await sendEmail({
        to,
        subject: `Showroom visit request: ${when}`,
        // Customer text is never put into the HTML; the admin page shows the details.
        text: `A customer asked to visit the showroom on ${when}${product ? ` to see ${product.name}` : ""}.\n\nOpen ${link} to see their details and confirm.`,
        html: `<p>A customer asked to visit the showroom on ${when.replace(/[<>&]/g, "")}.</p><p><a href="${link}">Open visit requests</a></p>`,
      });
    }
  } catch (error) {
    logger.error("visit.alert_failed", { visitId: visit.id, error });
  }
  return visit;
}

export async function listVisitRequests(query: { status?: VisitStatus; page: number }) {
  const where = query.status ? { status: query.status } : {};
  const [total, items] = await db.$transaction([
    db.visitRequest.count({ where }),
    db.visitRequest.findMany({
      where,
      orderBy: [{ preferredDate: "asc" }, { createdAt: "asc" }],
      skip: (query.page - 1) * VISIT_PAGE_SIZE,
      take: VISIT_PAGE_SIZE,
      include: { product: { select: { name: true, slug: true } } },
    }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / VISIT_PAGE_SIZE)) };
}

export async function countNewVisits(): Promise<number> {
  return db.visitRequest.count({ where: { status: "NEW" } });
}

export async function updateVisitStatus(
  id: string,
  status: VisitStatus,
  adminNote: string | null,
): Promise<{ name: string; before: VisitStatus }> {
  const before = await db.visitRequest.findUnique({
    where: { id },
    select: { status: true, name: true },
  });
  if (!before) throw new VisitError("Visit request not found.");
  await db.visitRequest.update({ where: { id }, data: { status, adminNote } });
  return { name: before.name, before: before.status };
}
