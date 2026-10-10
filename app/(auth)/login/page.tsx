import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, OrDivider } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { getCurrentUser } from "@/lib/auth-guards";
import { isGoogleAuthEnabled } from "@/lib/env";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

// Errors Auth.js can send back in ?error=...
const ERROR_MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already registered with a password. Log in with your email and password instead.",
  AccessDenied: "Google sign-in was cancelled or your Google email isn't verified.",
  Configuration: "Login is temporarily unavailable. Please try again later.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeRedirectPath(params.callbackUrl, "/account");
  if (await getCurrentUser()) redirect(callbackUrl);

  const errorMessage = params.error
    ? (ERROR_MESSAGES[params.error] ?? "Login failed. Please try again.")
    : null;

  return (
    <AuthCard title="Log in">
      {errorMessage && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      )}
      {isGoogleAuthEnabled && (
        <>
          <GoogleButton callbackUrl={callbackUrl} />
          <OrDivider />
        </>
      )}
      <LoginForm callbackUrl={callbackUrl} />
      <p className="text-muted-foreground text-sm">
        New here?{" "}
        <Link
          href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-foreground font-medium underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
