import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  amountInWords,
  financialYear,
  formatInvoiceNumber,
  isIntraState,
  taxForLine,
} from "@/lib/gst";
import { errorMessage, logger } from "@/lib/logger";
import { getBusiness } from "@/lib/business";
import type { AddressSnapshot } from "@/services/address.service";

export interface InvoiceLine {
  name: string;
  hsn: string;
  quantity: number;
  unitPriceInPaise: number;
  rateBps: number;
  taxableInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalInPaise: number;
}

export interface InvoiceSnapshot {
  number: string;
  date: string; // ISO
  orderNumber: string;
  seller: {
    name: string;
    address: string;
    gstin: string;
    state: string;
    email: string;
    phone: string;
  };
  buyer: { name: string; phone: string; email: string; address: string; state: string };
  placeOfSupply: string;
  intraState: boolean;
  lines: InvoiceLine[];
  totals: {
    taxableInPaise: number;
    cgstInPaise: number;
    sgstInPaise: number;
    igstInPaise: number;
    totalInPaise: number;
  };
  amountInWords: string;
  coupon?: { code: string; discountInPaise: number };
}

/**
 * Creates the tax invoice for a paid order (once). The number comes from a per-financial-year
 * counter that is incremented in the SAME transaction as the invoice insert, so numbers are
 * sequential without gaps or duplicates even when many orders are paid at once.
 */
export async function createInvoiceForOrder(orderId: string): Promise<{ number: string } | null> {
  const existing = await db.invoice.findUnique({ where: { orderId }, select: { number: true } });
  if (existing) return existing;

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true } } },
  });
  if (!order || !order.paidAt) return null;

  const seller = getBusiness();
  const address = order.addressSnapshot as AddressSnapshot;
  const intra = isIntraState(seller.state, address.state);

  const lines: InvoiceLine[] = order.items.map((item) => {
    // Orders from before Phase 12 have no saved tax split: work it out now with the saved rate.
    const tax =
      item.taxableValueInPaise > 0
        ? {
            taxableInPaise: item.taxableValueInPaise,
            cgstInPaise: item.cgstInPaise,
            sgstInPaise: item.sgstInPaise,
            igstInPaise: item.igstInPaise,
          }
        : taxForLine(item.lineTotalInPaise - item.discountInPaise, item.gstRateBps, intra);
    return {
      name: item.productName,
      hsn: item.hsnCode,
      quantity: item.quantity,
      unitPriceInPaise: item.priceInPaise,
      rateBps: item.gstRateBps,
      ...tax,
      totalInPaise: item.lineTotalInPaise - item.discountInPaise,
    };
  });
  if (order.shippingInPaise > 0) {
    // Composite supply: shipping is taxed at the rate of the main item (confirm with your CA).
    const rate = Math.max(...order.items.map((i) => i.gstRateBps));
    lines.push({
      name: "Shipping charges",
      hsn: "996812",
      quantity: 1,
      unitPriceInPaise: order.shippingInPaise,
      rateBps: rate,
      ...taxForLine(order.shippingInPaise, rate, intra),
      totalInPaise: order.shippingInPaise,
    });
  }

  const sum = (k: keyof InvoiceLine) => lines.reduce((s, l) => s + (l[k] as number), 0);
  const totals = {
    taxableInPaise: sum("taxableInPaise"),
    cgstInPaise: sum("cgstInPaise"),
    sgstInPaise: sum("sgstInPaise"),
    igstInPaise: sum("igstInPaise"),
    totalInPaise: sum("totalInPaise"),
  };
  if (totals.totalInPaise !== order.totalInPaise) {
    logger.error("invoice.total_mismatch", {
      orderId,
      invoice: totals.totalInPaise,
      order: order.totalInPaise,
    });
    return null;
  }

  const fy = financialYear(order.paidAt);
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
        INSERT INTO "InvoiceCounter" ("financialYear", "lastNumber") VALUES (${fy}, 1)
        ON CONFLICT ("financialYear") DO UPDATE SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1
        RETURNING "lastNumber"`;
      const lastNumber = Number(rows[0]!.lastNumber);
      const number = formatInvoiceNumber(env.INVOICE_PREFIX, fy, lastNumber);
      const snapshot: InvoiceSnapshot = {
        number,
        date: order.paidAt!.toISOString(),
        orderNumber: `#${order.id.slice(-8).toUpperCase()}`,
        seller: {
          name: seller.legalName,
          address: seller.address,
          gstin: seller.gstin,
          state: seller.state,
          email: seller.email,
          phone: seller.phone,
        },
        buyer: {
          name: address.fullName,
          phone: address.phone,
          email: order.user.email,
          address: [
            address.line1,
            address.line2,
            address.landmark,
            `${address.city}, ${address.state} ${address.pincode}`,
          ]
            .filter(Boolean)
            .join(", "),
          state: address.state,
        },
        placeOfSupply: address.state,
        intraState: intra,
        lines,
        totals,
        amountInWords: amountInWords(totals.totalInPaise),
        ...(order.couponCode && order.discountInPaise > 0
          ? { coupon: { code: order.couponCode, discountInPaise: order.discountInPaise } }
          : {}),
      };
      await tx.invoice.create({
        data: {
          orderId,
          number,
          financialYear: fy,
          sequence: lastNumber,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      logger.info("invoice.created", { orderId, number });
      return { number };
    });
  } catch (error) {
    // Someone else created it at the same moment: the counter increment rolled back with us.
    if ((error as { code?: string }).code === "P2002")
      return db.invoice.findUnique({ where: { orderId }, select: { number: true } });
    logger.error("invoice.create_failed", { orderId, error: errorMessage(error) });
    return null;
  }
}

/** The invoice if the user owns the order (or is an admin). */
export async function getInvoiceForViewer(
  orderId: string,
  viewer: { id: string; isAdmin: boolean },
) {
  const invoice = await db.invoice.findUnique({
    where: { orderId },
    include: { order: { select: { userId: true } } },
  });
  if (!invoice) return null;
  if (!viewer.isAdmin && invoice.order.userId !== viewer.id) return null;
  return { number: invoice.number, snapshot: invoice.snapshot as unknown as InvoiceSnapshot };
}

export async function hasInvoice(orderId: string) {
  return Boolean(await db.invoice.findUnique({ where: { orderId }, select: { id: true } }));
}
