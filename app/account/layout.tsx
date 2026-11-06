import { AccountNav } from "@/components/account/account-nav";
import { Ornament } from "@/components/layout/page-header";
import { requireUserPage } from "@/lib/auth-guards";

// Server-side check in addition to middleware (defence in depth).
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage("/account");
  const first = user.name?.split(" ")[0];
  return (
    <div>
      <div className="border-border border-b bg-gradient-to-b from-[#f6eee9] to-[var(--background)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <p className="text-xs font-semibold tracking-[0.18em] text-[#7d5512] uppercase">
            Your account
          </p>
          <p className="mt-1 text-2xl" style={{ fontFamily: "var(--font-display)" }}>
            {first ? `Namaste, ${first}` : "Namaste"}
          </p>
          <Ornament className="mt-2" />
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[200px_1fr] md:py-10">
        <aside className="md:sticky md:top-24 md:self-start">
          <AccountNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
