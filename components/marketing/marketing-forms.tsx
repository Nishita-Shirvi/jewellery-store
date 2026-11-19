"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmNewsletterAction,
  notifyMeAction,
  subscribeNewsletterAction,
  unsubscribeAction,
  type SimpleResult,
} from "@/app/marketing-actions";

function Message({ result, dark }: { result: SimpleResult | null; dark?: boolean }) {
  if (!result) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={
        result.ok
          ? dark
            ? "text-sm text-emerald-200"
            : "text-sm text-emerald-700"
          : dark
            ? "text-sm text-red-200"
            : "text-sm text-red-700"
      }
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

/** Footer sign-up (double opt-in: a confirmation email is sent first). */
export function NewsletterForm({ consentText }: { consentText: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<SimpleResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Newsletter"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await subscribeNewsletterAction({ email, consent })));
      }}
    >
      <label htmlFor="newsletter-email" className="text-sm font-medium">
        New collections, first
      </label>
      <div className="flex gap-2">
        <Input
          id="newsletter-email"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-background text-foreground h-9"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending}
          className="text-foreground"
        >
          Subscribe
        </Button>
      </div>
      <label className="flex items-start gap-2 text-xs text-[#e9d9dc]">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        {consentText}
      </label>
      <Message result={result} dark />
    </form>
  );
}

/** "Email me when it's back" for a sold-out variant. */
export function NotifyMe({
  variantId,
  email: known,
}: {
  variantId: string;
  email?: string | null;
}) {
  const [email, setEmail] = useState(known ?? "");
  const [result, setResult] = useState<SimpleResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Notify me"
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await notifyMeAction({ variantId, email })));
      }}
    >
      <label htmlFor={`notify-${variantId}`} className="text-sm">
        Sold out — get an email when it&apos;s back
      </label>
      <div className="flex gap-2">
        <Input
          id={`notify-${variantId}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-9 max-w-64"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          Notify me
        </Button>
      </div>
      <Message result={result} />
    </form>
  );
}

/** Confirm / unsubscribe pages use a button (mail scanners open links, but don't press buttons). */
export function ActionButton({
  label,
  action,
}: {
  label: string;
  action: { kind: "confirm"; token: string } | { kind: "unsubscribe"; e: string; t: string };
}) {
  const [result, setResult] = useState<SimpleResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <Message result={result} />;
  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () =>
            setResult(
              action.kind === "confirm"
                ? await confirmNewsletterAction(action.token)
                : await unsubscribeAction(action.e, action.t),
            ),
          )
        }
      >
        {label}
      </Button>
      <Message result={result} />
    </div>
  );
}
