import Link from "next/link";
import { LogOut, Shield, User } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import type { SessionUser } from "@/lib/auth-guards";

const pill =
  "hover:bg-on/10 focus-visible:ring-gilt inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm outline-none focus-visible:ring-2 [&_svg]:size-[18px] [&_svg]:shrink-0";

/** Sign-in / account controls in the shop header (on the brand-colour bar). */
export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <Link href="/login" className={`${pill} border-gilt/55 border`}>
        <User aria-hidden="true" />
        <span className="whitespace-nowrap max-sm:sr-only">Log in</span>
      </Link>
    );
  }

  const firstName = user.name?.split(" ")[0] ?? "Account";

  return (
    <div className="flex items-center gap-0.5">
      {user.role === "ADMIN" && (
        <Link href="/admin" className={pill}>
          <Shield aria-hidden="true" />
          <span className="hidden sm:inline">Admin</span>
        </Link>
      )}
      <Link href="/account" className={pill}>
        <User aria-hidden="true" />
        <span className="sr-only sm:not-sr-only sm:max-w-24 sm:truncate">{firstName}</span>
      </Link>
      <form action={logoutAction}>
        <button type="submit" aria-label="Log out" className={`${pill} px-2`}>
          <LogOut aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
