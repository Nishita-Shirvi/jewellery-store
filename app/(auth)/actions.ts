"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { EmailAlreadyRegisteredError, registerUser } from "@/services/auth.service";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Values echoed back so the form keeps what the user typed (never the password). */
  values?: { name?: string; email?: string };
}

const REGISTER_LIMIT_PER_IP = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function messageForAuthError(error: AuthError): string {
  if (error.type === "CredentialsSignin") {
    return (error as AuthError & { code?: string }).code === "rate_limited"
      ? "Too many login attempts. Please wait 15 minutes and try again."
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
    await registerUser(parsed.data);
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      return { fieldErrors: { email: [error.message] }, values };
    }
    console.error("[auth] registration failed", error);
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
