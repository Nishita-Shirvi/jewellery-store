"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/auth/form-field";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  type FormState,
} from "@/app/(auth)/actions";

function Notice({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
      >
        {state.message}
      </p>
    );
  return null;
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    requestPasswordResetAction,
    {},
  );
  return (
    <form action={action} className="space-y-4" noValidate aria-label="Forgot password">
      <Notice state={state} />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        errors={state.fieldErrors?.email}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4" noValidate aria-label="Reset password">
      <input type="hidden" name="token" value={token} />
      <Notice state={state} />
      <FormField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number."
        required
        errors={state.fieldErrors?.password}
      />
      <FormField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
