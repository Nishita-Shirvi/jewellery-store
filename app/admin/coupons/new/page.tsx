import { CouponForm } from "@/components/admin/coupon-form";
import { requirePermissionPage } from "@/lib/auth-guards";

export default async function NewCouponPage() {
  await requirePermissionPage("coupons.manage", "/admin/coupons/new");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add coupon</h1>
      <CouponForm
        values={{
          code: "",
          type: "PERCENT",
          value: "10",
          minOrder: "",
          maxDiscount: "",
          startsAt: "",
          endsAt: "",
          usageLimit: "",
          perUserLimit: "1",
          isActive: true,
        }}
      />
    </div>
  );
}
