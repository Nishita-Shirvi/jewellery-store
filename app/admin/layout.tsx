import type { Metadata } from "next";
import { headers } from "next/headers";
import { ADMIN_PATH_HEADER } from "@/auth.config";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireStaffPage } from "@/lib/auth-guards";
import { PAGE_PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

// Re-checks staff status, two-step sign-in and permissions on every admin page (middleware only
// reads the cookie). Each page also checks its own permission.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Back to the page they asked for after two-step sign-in (only ever an /admin path).
  const asked = (await headers()).get(ADMIN_PATH_HEADER) ?? "/admin";
  const staff = await requireStaffPage(
    /^\/admin(\/|\?|$)/.test(asked) && !asked.startsWith("//") ? asked : "/admin",
  );
  const links = PAGE_PERMISSIONS.filter(
    (l) => l.permission === null || staff.permissions.includes(l.permission),
  ).map(({ href, label }) => ({ href, label }));
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminNav links={links} />
      <div className="mt-8">{children}</div>
    </div>
  );
}
