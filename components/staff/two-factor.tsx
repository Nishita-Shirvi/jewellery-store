"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptInviteAction,
  confirmTotpSetupAction,
  startTotpSetupAction,
  verifyTwoFactorAction,
} from "@/app/staff/actions";

function ErrorText({ text }: { text: string | null }) {
  return (
    <p role="alert" className="min-h-5 text-sm text-red-700">
      {text}
    </p>
  );
}

/** First visit: show the key for the authenticator app, confirm a code, show recovery codes once. */
function TwoFactorSetup({ onCodes }: { onCodes: (codes: string[]) => void }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!setup)
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Staff accounts need two-step sign-in. Install an authenticator app (Google Authenticator,
          Microsoft Authenticator, 1Password…) on your phone, then press the button.
        </p>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await startTotpSetupAction();
              if (res.ok && res.secret && res.uri) setSetup({ secret: res.secret, uri: res.uri });
              else setError(res.ok ? "Something went wrong." : res.error);
            })
          }
        >
          Set up two-step sign-in
        </Button>
        <ErrorText text={error} />
      </div>
    );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await confirmTotpSetupAction(code);
          if (res.ok && res.codes) onCodes(res.codes);
          else setError(res.ok ? "Something went wrong." : res.error);
        });
      }}
    >
      <p className="text-sm">
        In the app choose <em>Add account → Enter a setup key</em> and type this key (time-based):
      </p>
      <p className="bg-muted rounded-md p-3 font-mono text-sm break-all" data-testid="totp-secret">
        {setup.secret.match(/.{1,4}/g)?.join(" ")}
      </p>
      <p className="text-muted-foreground text-xs">
        On this phone?{" "}
        <a href={setup.uri} className="underline">
          Open in the authenticator app
        </a>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="setup-code">6-digit code from the app</Label>
        <Input
          id="setup-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="w-40 tracking-widest"
        />
      </div>
      <Button type="submit" disabled={pending || code.length !== 6}>
        Turn on two-step sign-in
      </Button>
      <ErrorText text={error} />
    </form>
  );
}

/** Every new admin session: a code from the app (or a recovery code). */
function TwoFactorVerify({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await verifyTwoFactorAction(code, callbackUrl);
          if (res.ok) router.push(res.redirectTo ?? "/admin");
          else setError(res.error);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="verify-code">Code from your authenticator app</Label>
        <Input
          id="verify-code"
          autoComplete="one-time-code"
          maxLength={12}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-48 tracking-widest"
        />
        <p className="text-muted-foreground text-xs">
          Lost your phone? Enter a recovery code instead.
        </p>
      </div>
      <Button type="submit" disabled={pending || code.trim().length < 6}>
        Continue
      </Button>
      <ErrorText text={error} />
    </form>
  );
}

/**
 * The /staff/2fa page. ONE component for both steps, so the recovery codes stay on screen even
 * though turning 2FA on re-renders the page (the server then says "2FA is on").
 */
export function TwoFactorPanel({
  enabled,
  callbackUrl,
}: {
  enabled: boolean;
  callbackUrl: string;
}) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);
  if (codes)
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Two-step sign-in is on. Keep these <strong>recovery codes</strong> somewhere safe (not on
          your phone). Each works once if you lose your phone. They won&apos;t be shown again.
        </p>
        <ul
          className="bg-muted grid grid-cols-2 gap-2 rounded-md p-4 font-mono text-sm"
          data-testid="recovery-codes"
        >
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button type="button" onClick={() => router.push(callbackUrl)}>
          I&apos;ve saved them — continue
        </Button>
      </div>
    );
  return enabled ? (
    <TwoFactorVerify callbackUrl={callbackUrl} />
  ) : (
    <TwoFactorSetup onCodes={setCodes} />
  );
}

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInviteAction(token);
            if (res.ok) router.push(res.redirectTo ?? "/admin");
            else setError(res.error);
          })
        }
      >
        Accept invitation
      </Button>
      <ErrorText text={error} />
    </div>
  );
}
