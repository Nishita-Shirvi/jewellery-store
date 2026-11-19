import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInvite } from "@/components/staff/two-factor";
import { getCurrentUser } from "@/lib/auth-guards";
import { findInvite } from "@/services/staff.service";

export const metadata: Metadata = { title: "Staff invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function StaffInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const invite = await findInvite(token);
  const valid = invite && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();
  const user = await getCurrentUser();
  const here = `/staff/invite?token=${encodeURIComponent(token)}`;
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Staff invitation</h1>
      {!valid ? (
        <p role="alert" className="text-sm text-red-700">
          This invitation has expired or was already used. Ask the store owner for a new one.
        </p>
      ) : !user ? (
        <>
          <p className="text-sm">
            You&apos;re invited as <strong>{invite.role.name}</strong>. Sign in — or create an
            account — with <strong>{invite.email}</strong>, then come back to this page.
          </p>
          <p className="flex gap-4 text-sm">
            <Link href={`/login?callbackUrl=${encodeURIComponent(here)}`} className="underline">
              Log in
            </Link>
            <Link href={`/register?callbackUrl=${encodeURIComponent(here)}`} className="underline">
              Create an account
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-sm">
            Join the store&apos;s staff as <strong>{invite.role.name}</strong> (invitation for{" "}
            {invite.email}).
          </p>
          <AcceptInvite token={token} />
        </>
      )}
    </div>
  );
}
