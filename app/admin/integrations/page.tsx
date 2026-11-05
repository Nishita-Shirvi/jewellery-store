import { ApiKeyForm, WebhookForm } from "@/components/admin/accounting-forms";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/lib/auth-guards";
import { publicEnv } from "@/lib/env";
import { formatIst } from "@/lib/merch";
import { WEBHOOK_EVENTS, listApiKeys, listWebhookEndpoints } from "@/services/integrations.service";
import { revokeApiKeyAction, setWebhookActiveAction } from "../actions";

export const dynamic = "force-dynamic";

/** Admin → Integrations (Phase 29): Products API keys and outgoing webhooks. */
export default async function IntegrationsPage() {
  await requirePermissionPage("integrations.manage", "/admin/integrations");
  const [keys, hooks] = await Promise.all([listApiKeys(), listWebhookEndpoints()]);
  const base = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  return (
    <div className="space-y-12">
      <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>

      <section aria-labelledby="api-h" className="space-y-4">
        <h2 id="api-h" className="text-lg font-medium">
          Products API
        </h2>
        <p className="text-muted-foreground text-sm">
          Read-only access to your live products (names, prices, stock, photos) for marketplaces,
          shopping feeds or your other systems. Send the key as{" "}
          <code>Authorization: Bearer sk_live_…</code>. Endpoints:{" "}
          <code>{base}/api/v1/products</code> (page, limit, category, updated_since) and{" "}
          <code>{base}/api/v1/products/&lt;slug&gt;</code>. Up to 120 requests a minute per key.
        </p>
        <ApiKeyForm />
        <ul className="divide-border divide-y rounded-md border text-sm">
          {keys.length === 0 && <li className="text-muted-foreground p-3">No keys yet.</li>}
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <strong>{k.name}</strong> <code className="text-muted-foreground">{k.prefix}…</code>
                <span className="text-muted-foreground block text-xs">
                  Created {formatIst(k.createdAt)} · last used {formatIst(k.lastUsedAt)}
                  {k.revokedAt ? ` · revoked ${formatIst(k.revokedAt)}` : ""}
                </span>
              </span>
              {!k.revokedAt && (
                <form action={revokeApiKeyAction}>
                  <input type="hidden" name="keyId" value={k.id} />
                  <ConfirmSubmit
                    label="Revoke"
                    title={`Revoke "${k.name}"?`}
                    description="Anything using this key stops working at once."
                    confirmLabel="Revoke"
                  />
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="hooks-h" className="space-y-4">
        <h2 id="hooks-h" className="text-lg font-medium">
          Webhooks
        </h2>
        <p className="text-muted-foreground text-sm">
          We POST a JSON event to your address when an order is confirmed, shipped, delivered,
          cancelled or refunded. Each request carries <code>X-Store-Signature: t=…,v1=…</code> — an
          HMAC-SHA256 of <code>t.body</code> with the signing secret — so your system can check it
          came from the store. Failed deliveries are retried for about a day (Admin → Jobs).
        </p>
        <WebhookForm events={WEBHOOK_EVENTS} />
        <ul className="divide-border divide-y rounded-md border text-sm">
          {hooks.length === 0 && <li className="text-muted-foreground p-3">No webhooks yet.</li>}
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <strong className="break-all">{h.url}</strong>
                <span className="text-muted-foreground block text-xs">
                  {h.active ? "Active" : "Paused"} ·{" "}
                  {h.events.length ? h.events.join(", ") : "all events"}
                </span>
              </span>
              <span className="flex gap-2">
                <form action={setWebhookActiveAction}>
                  <input type="hidden" name="webhookId" value={h.id} />
                  <input type="hidden" name="webhookActive" value={h.active ? "false" : "true"} />
                  <Button type="submit" size="sm" variant="outline">
                    {h.active ? "Pause" : "Resume"}
                  </Button>
                </form>
                <form action={setWebhookActiveAction}>
                  <input type="hidden" name="webhookId" value={h.id} />
                  <input type="hidden" name="remove" value="true" />
                  <ConfirmSubmit
                    label="Remove"
                    title="Remove this webhook?"
                    description="We stop sending events to this address."
                    confirmLabel="Remove"
                  />
                </form>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
