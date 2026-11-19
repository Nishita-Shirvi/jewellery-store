import { RecoveryLinks } from "@/components/layout/recovery-links";
import { getCurrentUser } from "@/lib/auth-guards";

/** A product address that doesn't exist (any more). */
export default async function ProductNotFound() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-muted-foreground text-sm tracking-widest uppercase">Error 404</p>
      <h1 className="mt-2 text-3xl">Product not found</h1>
      <p className="text-muted-foreground mt-3">
        This piece may have sold out or been removed from the store. Have a look at what&apos;s
        available now.
      </p>
      <RecoveryLinks signedIn={Boolean(user)} />
    </div>
  );
}
