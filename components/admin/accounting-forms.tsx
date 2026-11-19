"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  createApiKeyAction,
  createWebhookAction,
  importProductsAction,
  type ImportFormState,
  type SecretFormState,
} from "@/app/admin/actions";

/** Bulk product import: check the file first, then import (all rows, or none). */
export function ProductImportForm() {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    importProductsAction,
    {},
  );
  const r = state.report;
  return (
    <form action={action} className="space-y-3" aria-label="Import products">
      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        aria-label="Products CSV file"
        required
        className="text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="mode"
          value="check"
          variant="outline"
          size="sm"
          disabled={pending}
        >
          {pending ? "Checking…" : "Check file"}
        </Button>
        <Button type="submit" name="mode" value="apply" size="sm" disabled={pending}>
          Import
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {r && (
        <div role="status" className="space-y-2 text-sm" data-testid="import-report">
          <p className={r.errors ? "text-red-700" : "text-emerald-800"}>
            {r.applied
              ? `Imported: ${r.created} new, ${r.updated} updated.`
              : r.errors
                ? `${r.errors} row(s) need fixing — nothing was saved.`
                : `Looks good: ${r.created} new, ${r.updated} to update. Choose the file again and press Import.`}
          </p>
          {r.rows.some((row) => row.errors.length || row.note) && (
            <ul className="max-h-72 space-y-1 overflow-auto rounded-md border p-2">
              {r.rows
                .filter((row) => row.errors.length || row.note)
                .map((row) => (
                  <li key={row.line}>
                    <strong>Line {row.line}</strong> ({row.slug}):{" "}
                    {row.errors.length ? (
                      <span className="text-red-700">{row.errors.join("; ")}</span>
                    ) : (
                      <span className="text-muted-foreground">{row.note}</span>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

function SecretOnce({ state }: { state: SecretFormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-red-700">
        {state.error}
      </p>
    );
  if (!state.secret) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
    >
      <p className="font-medium">{state.label} — copy it now, it won&apos;t be shown again:</p>
      <code className="mt-1 block break-all select-all" data-testid="secret-once">
        {state.secret}
      </code>
    </div>
  );
}

export function ApiKeyForm() {
  const [state, action, pending] = useActionState<SecretFormState, FormData>(
    createApiKeyAction,
    {},
  );
  return (
    <form action={action} className="space-y-3" aria-label="New API key">
      <div className="flex flex-wrap gap-2">
        <input
          name="keyName"
          aria-label="What uses this key"
          placeholder="What uses it (e.g. Google Merchant feed)"
          className="border-input bg-background h-9 min-w-64 rounded-md border px-3 text-sm"
          required
        />
        <Button type="submit" size="sm" disabled={pending}>
          Create key
        </Button>
      </div>
      <SecretOnce state={state} />
    </form>
  );
}

export function WebhookForm({ events }: { events: readonly string[] }) {
  const [state, action, pending] = useActionState<SecretFormState, FormData>(
    createWebhookAction,
    {},
  );
  return (
    <form action={action} className="space-y-3" aria-label="New webhook">
      <input
        name="webhookUrl"
        type="url"
        aria-label="Webhook URL"
        placeholder="https://your-system.example.com/hooks/store"
        className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        required
      />
      <fieldset className="flex flex-wrap gap-3 text-sm">
        <legend className="text-muted-foreground mb-1 text-xs">Events (none ticked = all)</legend>
        {events.map((e) => (
          <label key={e} className="flex items-center gap-1.5">
            <input type="checkbox" name="webhookEvents" value={e} /> {e}
          </label>
        ))}
      </fieldset>
      <Button type="submit" size="sm" disabled={pending}>
        Add webhook
      </Button>
      <SecretOnce state={state} />
    </form>
  );
}
