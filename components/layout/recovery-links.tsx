import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Ways out of an error or "not found" page: home, the jewellery, the customer's account (or
 * log in), and help. Works in server and client components.
 */
export function RecoveryLinks({ signedIn }: { signedIn?: boolean | null }) {
  return (
    <nav aria-label="Where to go next" className="mt-8 flex flex-wrap justify-center gap-3">
      <Button asChild>
        <Link href="/">Home</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/products">Browse jewellery</Link>
      </Button>
      {signedIn === false ? (
        <Button asChild variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      ) : (
        // Unknown (client error page) or signed in: /account asks to log in when needed.
        <Button asChild variant="outline">
          <Link href="/account">{signedIn ? "My account" : "My account / Log in"}</Link>
        </Button>
      )}
      <Button asChild variant="ghost">
        <Link href="/help">Help</Link>
      </Button>
    </nav>
  );
}
