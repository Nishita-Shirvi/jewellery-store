import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "../password-forms";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?">
      <p className="text-muted-foreground text-sm">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </p>
      <ForgotPasswordForm />
      <p className="text-muted-foreground text-sm">
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Back to log in
        </Link>
      </p>
    </AuthCard>
  );
}
