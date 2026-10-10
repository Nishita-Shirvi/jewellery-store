import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminPage } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

// Re-checks the role in the database on every admin page (middleware only reads the cookie).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminNav />
      <div className="mt-8">{children}</div>
    </div>
  );
}
