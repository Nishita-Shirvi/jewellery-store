import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { resetTokenValid } from "@/services/password.service";
import { ResetPasswordForm } from "../password-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const valid = await resetTokenValid(token);
  return (
    <AuthCard title="Choose a new password">
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p role="alert" className="text-sm text-red-700">
          This link has expired or was already used.{" "}
          <Link href="/forgot-password" className="underline">
            Ask for a new one
          </Link>
          .
        </p>
      )}
    </AuthCard>
  );
}
