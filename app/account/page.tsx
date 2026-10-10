import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">My account</h1>
      <dl className="mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{user?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{user?.email}</dd>
        <dt className="text-muted-foreground">Account type</dt>
        <dd>{user?.role === "ADMIN" ? "Admin" : "Customer"}</dd>
      </dl>
      <ul className="mt-8 grid max-w-md gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/account/orders"
            className="border-border hover:bg-muted block rounded-md border p-4"
          >
            <span className="font-medium">Your orders</span>
            <span className="text-muted-foreground block text-xs">Track and view past orders</span>
          </Link>
        </li>
        <li>
          <Link
            href="/account/addresses"
            className="border-border hover:bg-muted block rounded-md border p-4"
          >
            <span className="font-medium">Addresses</span>
            <span className="text-muted-foreground block text-xs">Manage delivery addresses</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
