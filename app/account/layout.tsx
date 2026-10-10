import Link from "next/link";
import { requireUserPage } from "@/lib/auth-guards";

// Server-side check in addition to middleware (defence in depth).
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireUserPage("/account");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav aria-label="Account" className="border-border mb-8 flex gap-4 border-b pb-3 text-sm">
        <Link href="/account" className="hover:underline">
          Overview
        </Link>
        <Link href="/account/orders" className="hover:underline">
          Orders
        </Link>
        <Link href="/account/wishlist" className="hover:underline">
          Wishlist
        </Link>
        <Link href="/account/addresses" className="hover:underline">
          Addresses
        </Link>
      </nav>
      {children}
    </div>
  );
}
