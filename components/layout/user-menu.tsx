import Link from "next/link";
import { LogOut, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(auth)/actions";
import type { SessionUser } from "@/lib/auth-guards";

/** Placeholder signed-in controls (a proper dropdown comes with the final design). */
export function UserMenu({ user }: { user: SessionUser | null }) {
  if (!user) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/login">
          <User />
          <span>Log in</span>
        </Link>
      </Button>
    );
  }

  const firstName = user.name?.split(" ")[0] ?? "Account";

  return (
    <div className="flex items-center gap-1">
      {user.role === "ADMIN" && (
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <Shield />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </Button>
      )}
      <Button asChild variant="ghost" size="sm">
        <Link href="/account">
          <User />
          <span className="max-w-24 truncate">{firstName}</span>
        </Link>
      </Button>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
          <LogOut />
        </Button>
      </form>
    </div>
  );
}
