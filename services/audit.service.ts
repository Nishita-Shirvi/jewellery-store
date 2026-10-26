import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface AuditEntry {
  action: string;
  entityType:
    | "product"
    | "category"
    | "order"
    | "coupon"
    | "refund"
    | "return"
    | "review"
    | "invoice"
    | "shipment";
  entityId: string;
  summary: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

/** Records an admin change. Never throws: a failed audit write is logged, the change itself stands. */
export async function audit(actor: { id: string; email: string | null }, entry: AuditEntry) {
  try {
    await db.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email ?? "unknown",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary.slice(0, 300),
        changes: (entry.changes as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  } catch (error) {
    logger.error("audit.write_failed", {
      action: entry.action,
      entityId: entry.entityId,
      error,
    });
  }
}

/** Only the fields whose values differ. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of fields) {
    const a = before[f];
    const b = after[f];
    if (b !== undefined && JSON.stringify(a) !== JSON.stringify(b))
      out[String(f)] = { from: a, to: b };
  }
  return out;
}

export async function listAudit(query: { entityType?: string; page: number }) {
  const where = query.entityType ? { entityType: query.entityType } : {};
  const PAGE = 50;
  const [total, rows] = await db.$transaction([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * PAGE,
      take: PAGE,
    }),
  ]);
  return { rows, pageCount: Math.max(1, Math.ceil(total / PAGE)) };
}
