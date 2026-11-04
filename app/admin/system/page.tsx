import { Button } from "@/components/ui/button";
import { requirePermissionPage } from "@/lib/auth-guards";
import { config } from "@/lib/config";
import { formatIst } from "@/lib/merch";
import { sumMetric } from "@/lib/metrics";
import { integrationsSummary } from "@/lib/startup";
import { getDeepHealth } from "@/services/health.service";
import { listAlertStates } from "@/services/monitor.service";
import { runAlertChecksAction } from "../actions";

export const dynamic = "force-dynamic";

const INTEGRATION_LABELS: Record<string, string> = {
  razorpay: "Razorpay payments",
  email: "Email (Resend)",
  imageUploads: "Image uploads (Cloudinary)",
  shiprocket: "Shiprocket shipping",
  googleLogin: "Google login",
  sms: "SMS (MSG91)",
  sentry: "Error tracking (Sentry)",
  cronJobs: "Scheduled jobs (CRON_SECRET)",
  chatAlerts: "Chat alerts (ALERT_WEBHOOK_URL)",
};

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}
    >
      {children}
    </span>
  );
}

/** Admin → System (Phase 26): is everything running, and is anything on fire. */
export default async function SystemPage() {
  await requirePermissionPage("system.view", "/admin/system");
  const [health, alerts, gateway, badSignatures, errors] = await Promise.all([
    getDeepHealth(),
    listAlertStates(),
    sumMetric("payments.gateway_error", 60),
    sumMetric("webhook.bad_signature", 60),
    sumMetric("log.error", 60),
  ]);
  const integrations = integrationsSummary();
  const cronOk = health.cronMinutesAgo !== null && health.cronMinutesAgo <= 45;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Health, alerts and integrations. What to do for each alert: Docs/RUNBOOK.md.
          </p>
        </div>
        <form action={runAlertChecksAction}>
          <Button type="submit" variant="outline" size="sm">
            Run alert checks now
          </Button>
        </form>
      </div>

      <section aria-labelledby="health-h" className="space-y-3">
        <h2 id="health-h" className="text-lg font-medium">
          Health
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border p-3" data-testid="health-db">
            <dt className="text-muted-foreground">Database</dt>
            <dd className="mt-1">
              <Pill ok={health.db === "ok"}>{health.db === "ok" ? "OK" : "Down"}</Pill>{" "}
              {health.dbMs} ms
            </dd>
          </div>
          <div className="rounded-md border p-3" data-testid="health-cron">
            <dt className="text-muted-foreground">Scheduler last ran</dt>
            <dd className="mt-1">
              <Pill ok={cronOk}>{cronOk ? "OK" : "Late"}</Pill>{" "}
              {health.cronMinutesAgo === null ? "never" : `${health.cronMinutesAgo} min ago`}
            </dd>
          </div>
          <div className="rounded-md border p-3" data-testid="health-jobs">
            <dt className="text-muted-foreground">Background jobs</dt>
            <dd className="mt-1">
              <Pill ok={health.overdueJobs === 0 && health.deadJobs24h === 0}>
                {health.overdueJobs} overdue · {health.deadJobs24h} failed (24 h)
              </Pill>
            </dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground">Last hour</dt>
            <dd className="mt-1">
              {gateway} payment gateway error(s) · {badSignatures} bad webhook signature(s) ·{" "}
              {errors} error log line(s)
            </dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="mt-1 font-mono text-xs">
              {health.release?.slice(0, 12) ?? "local build"}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="alerts-h" className="space-y-3">
        <h2 id="alerts-h" className="text-lg font-medium">
          Alerts
        </h2>
        <p className="text-muted-foreground text-sm">
          Checked every cron run (and payments the moment one fails). Emails go to{" "}
          {config.alerts.admin_email || "every admin"}
          {integrations.chatAlerts ? " and the chat webhook" : ""}; reminders every{" "}
          {config.alerts.repeat_hours} h while an alert lasts.
        </p>
        <div className="border-border overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-2">Alert</th>
                <th className="p-2">Status</th>
                <th className="p-2">Latest check</th>
                <th className="p-2">Runbook</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {alerts.map((a) => (
                <tr key={a.key} data-testid={`alert-${a.key}`}>
                  <td className="p-2 font-medium">{a.title}</td>
                  <td className="p-2">
                    {a.state?.firing ? (
                      <Pill ok={false}>Firing since {formatIst(a.state.since)}</Pill>
                    ) : (
                      <Pill ok>OK</Pill>
                    )}
                  </td>
                  <td className="p-2">
                    {a.state ? (
                      <>
                        {a.state.detail}
                        <span className="text-muted-foreground block text-xs">
                          {formatIst(a.state.checkedAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not checked yet</span>
                    )}
                  </td>
                  <td className="text-muted-foreground p-2 font-mono text-xs">#{a.runbook}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="int-h" className="space-y-3">
        <h2 id="int-h" className="text-lg font-medium">
          Integrations
        </h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          {Object.entries(INTEGRATION_LABELS).map(([key, label]) => {
            const on = Boolean(integrations[key as keyof typeof integrations]);
            return (
              <li key={key} className="flex items-center justify-between rounded-md border p-2">
                <span>{label}</span>
                <Pill ok={on}>
                  {on
                    ? key === "razorpay"
                      ? `On (${integrations.razorpayMode})`
                      : "On"
                    : "Not set up"}
                </Pill>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
