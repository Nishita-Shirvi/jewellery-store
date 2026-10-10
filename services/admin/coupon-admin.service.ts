import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { CouponFormInput } from "@/lib/validation/admin";
import { AdminInputError } from "@/services/admin/product-admin.service";

export async function listCouponsAdmin() {
  return db.coupon.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], take: 200 });
}

export async function getCouponAdmin(id: string) {
  return db.coupon.findUnique({ where: { id } });
}

function toData(input: CouponFormInput) {
  return {
    code: input.code,
    type: input.type,
    value: input.value,
    minOrderInPaise: input.minOrder,
    maxDiscountInPaise: input.type === "PERCENT" ? input.maxDiscount : null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimit: input.usageLimit,
    perUserLimit: input.perUserLimit,
    isActive: input.isActive,
  };
}

export async function saveCoupon(id: string | null, input: CouponFormInput, adminId: string) {
  try {
    const coupon = id
      ? await db.coupon.update({ where: { id }, data: toData(input) })
      : await db.coupon.create({ data: toData(input) });
    logger.info(id ? "admin.coupon_updated" : "admin.coupon_created", {
      adminId,
      couponId: coupon.id,
      code: coupon.code,
    });
    return coupon;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AdminInputError(`The code ${input.code} already exists.`);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      throw new AdminInputError("Coupon not found.");
    throw error;
  }
}

export async function setCouponActive(id: string, isActive: boolean, adminId: string) {
  await db.coupon.updateMany({ where: { id }, data: { isActive } });
  logger.info("admin.coupon_active_changed", { adminId, couponId: id, isActive });
}
