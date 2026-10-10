import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, OrDivider } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { getCurrentUser } from "@/lib/auth-guards";
import { isGoogleAuthEnabled } from "@/lib/env";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeRedirectPath(params.callbackUrl, "/account");
  if (await getCurrentUser()) redirect(callbackUrl);

  return (
    <AuthCard title="Create an account">
      {isGoogleAuthEnabled && (
        <>
          <GoogleButton callbackUrl={callbackUrl} />
          <OrDivider />
        </>
      )}
      <RegisterForm callbackUrl={callbackUrl} />
      <p className="text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-foreground font-medium underline underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
