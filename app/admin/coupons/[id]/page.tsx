import { notFound } from "next/navigation";
import { CouponForm } from "@/components/admin/coupon-form";
import { toIstInput } from "@/lib/datetime-input";
import { paiseToRupeesInput } from "@/lib/money";
import { getCouponAdmin } from "@/services/admin/coupon-admin.service";

export default async function EditCouponPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const c = await getCouponAdmin(id);
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Coupon {c.code}</h1>
      {created && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Coupon created.
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        Used {c.usedCount} time(s){c.usageLimit ? ` of ${c.usageLimit}` : ""}.
      </p>
      <CouponForm
        values={{
          id: c.id,
          code: c.code,
          type: c.type,
          value: c.type === "PERCENT" ? String(c.value) : paiseToRupeesInput(c.value),
          minOrder: c.minOrderInPaise ? paiseToRupeesInput(c.minOrderInPaise) : "",
          maxDiscount: c.maxDiscountInPaise ? paiseToRupeesInput(c.maxDiscountInPaise) : "",
          startsAt: toIstInput(c.startsAt),
          endsAt: toIstInput(c.endsAt),
          usageLimit: c.usageLimit ? String(c.usageLimit) : "",
          perUserLimit: c.perUserLimit ? String(c.perUserLimit) : "",
          isActive: c.isActive,
        }}
      />
    </div>
  );
}
