"use client";

import { useActionState, useEffect, useState } from "react";
import { readConsent } from "@/components/analytics/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteAccountAction,
  recordAnalyticsConsentAction,
  type PrivacyFormState,
} from "@/app/account/privacy/actions";

/** Analytics cookies live in this browser's cookie; the choice is also logged on the account. */
export function AnalyticsToggle() {
  const [value, setValue] = useState<"analytics" | "essential" | null>(null);
  useEffect(() => setValue(readConsent()), []);
  function choose(next: "analytics" | "essential") {
    document.cookie = `consent=${next}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    setValue(next);
    void recordAnalyticsConsentAction(next === "analytics");
  }
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="analytics-consent">
      <span className="text-sm">
        {value === "analytics" ? "On" : value === "essential" ? "Off" : "Not chosen yet (off)"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => choose(value === "analytics" ? "essential" : "analytics")}
      >
        {value === "analytics" ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}

export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<PrivacyFormState, FormData>(
    deleteAccountAction,
    {},
  );
  return (
    <form action={action} className="space-y-3" aria-label="Delete account">
      {state.error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
          <Input id="delete-confirm" name="confirm" autoComplete="off" required />
        </div>
        {hasPassword && (
          <div className="space-y-1.5">
            <Label htmlFor="delete-password">Your password</Label>
            <Input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        )}
      </div>
      <Button type="submit" className="bg-red-700 text-white hover:bg-red-800" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
