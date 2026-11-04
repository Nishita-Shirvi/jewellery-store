import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TwoFactorPanel } from "@/components/staff/two-factor";
import { requireUserPage } from "@/lib/auth-guards";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getStaffAccess } from "@/services/staff.service";

export const metadata: Metadata = { title: "Two-step sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const next = safeRedirectPath(callbackUrl ?? null, "/admin");
  const user = await requireUserPage(`/staff/2fa?callbackUrl=${encodeURIComponent(next)}`);
  const access = await getStaffAccess(user.id);
  if (!access.isStaff) redirect("/forbidden");
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Two-step sign-in</h1>
      <TwoFactorPanel enabled={Boolean(access.totpEnabledAt)} callbackUrl={next} />
    </div>
  );
}
