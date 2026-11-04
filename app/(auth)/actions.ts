"use server";

import { REFERRAL_COOKIE, linkReferral } from "@/services/marketing.service";

import { headers, cookies } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { loginSchema, registerSchema, resetSchema } from "@/lib/validation/auth";
import { redirect } from "next/navigation";
import { ResetError, requestPasswordReset, resetPassword } from "@/services/password.service";
import { EmailAlreadyRegisteredError, registerUser } from "@/services/auth.service";
import { setConsent } from "@/services/privacy.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Values echoed back so the form keeps what the user typed (never the password). */
  values?: { name?: string; email?: string };
  /** A neutral confirmation (e.g. "check your email"). */
  message?: string;
}

const REGISTER_LIMIT_PER_IP = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function messageForAuthError(error: AuthError): string {
  if (error.type === "CredentialsSignin") {
    const code = (error as AuthError & { code?: string }).code;
    return code === "rate_limited" || code === "locked"
      ? "Too many login attempts. Please wait 15 minutes and try again, or reset your password."
      : "Incorrect email or password.";
  }
  return "Something went wrong while signing in. Please try again.";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = { email: formData.get("email"), password: formData.get("password") };
  const values = { email: typeof raw.email === "string" ? raw.email : "" };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeRedirectPath(formData.get("callbackUrl"), "/account"),
    });
    return {};
  } catch (error) {
    // signIn() throws a redirect on success; only Auth.js errors are handled here.
    if (error instanceof AuthError) return { error: messageForAuthError(error), values };
    throw error;
  }
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  };
  const values = {
    name: typeof raw.name === "string" ? raw.name : "",
    email: typeof raw.email === "string" ? raw.email : "",
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const ip = getClientIp(await headers());
  const limit = rateLimit(`register:${ip}`, REGISTER_LIMIT_PER_IP, REGISTER_WINDOW_MS);
  if (!limit.ok) {
    return { error: "Too many sign-up attempts. Please try again in an hour.", values };
  }

  try {
    const user = await registerUser(parsed.data);
    // Phase 27: marketing emails only with an explicit, unticked-by-default opt-in (logged).
    if (formData.get("marketingConsent") === "on")
      await setConsent(user.id, "email_marketing", true, "register");
    // Signed up through a friend's referral link (/r/CODE)? Never blocks the sign-up.
    const jar = await cookies();
    const ref = jar.get(REFERRAL_COOKIE)?.value;
    if (ref) {
      await linkReferral(user.id, ref).catch((error) =>
        logger.warn("auth.referral_link_failed", { error }),
      );
      jar.delete(REFERRAL_COOKIE);
    }
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      return { fieldErrors: { email: [error.message] }, values };
    }
    logger.error("auth.register_failed", { error });
    return { error: "We couldn't create your account. Please try again.", values };
  }

  // Sign the new customer in straight away.
  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeRedirectPath(formData.get("callbackUrl"), "/account"),
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created. Please log in.", values };
    }
    throw error;
  }
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  await signIn("google", { redirectTo: safeRedirectPath(formData.get("callbackUrl"), "/account") });
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

// ── Forgot / reset password (Phase 23) ───────────────────

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.shape.email.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: ["Enter a valid email address"] } };
  const ip = getClientIp(await headers());
  // Limit per IP and per email; the answer is the same either way.
  const allowed =
    rateLimit(`reset-ip:${ip}`, 10, 60 * 60_000).ok &&
    rateLimit(`reset-email:${parsed.data}`, 3, 60 * 60_000).ok;
  if (allowed) await requestPasswordReset(parsed.data);
  return {
    error: undefined,
    values: { email: "" },
    message:
      "If an account uses that email, we've sent a link to reset the password. It works for 30 minutes.",
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const parsed = resetSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const ip = getClientIp(await headers());
  if (!rateLimit(`reset-submit:${ip}`, 20, 60 * 60_000).ok)
    return { error: "Too many attempts. Please try again later." };
  try {
    await resetPassword(token, parsed.data.password);
  } catch (error) {
    if (error instanceof ResetError) return { error: error.message };
    throw error;
  }
  redirect("/login?reset=1");
}
