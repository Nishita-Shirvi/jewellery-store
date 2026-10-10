import Link from "next/link";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Button } from "@/components/ui/button";
import { describeCoupon } from "@/lib/coupons";
import { listCouponsAdmin } from "@/services/admin/coupon-admin.service";
import { toggleCouponAction } from "../actions";

export const dynamic = "force-dynamic";
const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function AdminCouponsPage() {
  const coupons = await listCouponsAdmin();
  const now = new Date();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
        <Button asChild>
          <Link href="/admin/coupons/new">Add coupon</Link>
        </Button>
      </div>
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-muted-foreground text-left text-xs">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Offer</th>
              <th className="p-3">Valid</th>
              <th className="p-3">Used</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {coupons.map((c) => {
              const expired = c.endsAt !== null && c.endsAt < now;
              return (
                <tr key={c.id}>
                  <td className="p-3">
                    <Link href={`/admin/coupons/${c.id}`} className="font-medium hover:underline">
                      {c.code}
                    </Link>
                  </td>
                  <td className="p-3">{describeCoupon(c)}</td>
                  <td className="text-muted-foreground p-3">
                    {c.startsAt ? dateFmt.format(c.startsAt) : "Now"} –{" "}
                    {c.endsAt ? dateFmt.format(c.endsAt) : "No end"}
                  </td>
                  <td className="p-3">
                    {c.usedCount}
                    {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                  </td>
                  <td className="p-3">{!c.isActive ? "Off" : expired ? "Expired" : "Active"}</td>
                  <td className="p-3 text-right">
                    <form action={toggleCouponAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="isActive" value={c.isActive ? "false" : "true"} />
                      {c.isActive ? (
                        <ConfirmSubmit
                          label="Turn off"
                          title={`Turn off ${c.code}?`}
                          description="Customers won't be able to use it. Orders already placed keep their discount."
                          confirmLabel="Turn off"
                        />
                      ) : (
                        <Button type="submit" size="sm" variant="outline">
                          Turn on
                        </Button>
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground p-6 text-center">
                  No coupons yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
