import { Button } from "@/components/ui/button";
import { jobOverview } from "@/services/jobs.service";
import { retryJobAction } from "../actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

const TYPE_LABEL: Record<string, string> = {
  "email.order": "Order email",
  "sms.order": "Order SMS",
  "invoice.create": "Tax invoice",
  "shipment.create": "Shiprocket shipment",
  "webhook.razorpay": "Razorpay event",
  "webhook.shiprocket": "Courier tracking event",
  "alerts.low_stock": "Low-stock email",
  "reservations.release": "Release expired stock holds",
  "email.marketing": "Marketing email",
  "marketing.scan": "Cart reminders / back-in-stock / referrals",
};

/** What the job was about, for people (order number when there is one). */
function subject(payload: unknown): string {
  const p = (payload ?? {}) as { orderId?: string; event?: string; webhookEventId?: string };
  const parts = [
    p.orderId ? `Order #${p.orderId.slice(-8).toUpperCase()}` : null,
    p.event ?? null,
    p.webhookEventId ? `event ${p.webhookEventId.slice(-8)}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ retried?: string }>;
}) {
  const flash = await searchParams;
  const { counts, dead, failing } = await jobOverview();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Background jobs</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Emails, SMS, invoices, Shiprocket shipments and payment/courier events run in the
          background and are retried automatically (30 s, 1 min, 2 min … up to 6 tries). Only jobs
          that kept failing are listed here — fix the cause (e.g. an API key), then retry.
        </p>
      </div>

      {flash.retried && (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          Queued {Number(flash.retried) || 0} job(s) again.
        </p>
      )}

      <dl className="grid gap-4 sm:grid-cols-4">
        {(
          [
            ["PENDING", "Waiting"],
            ["RUNNING", "Running"],
            ["DONE", "Done (last 30 days)"],
            ["DEAD", "Failed"],
          ] as const
        ).map(([status, label]) => (
          <div key={status} className="border-border rounded-md border p-4">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 text-xl font-semibold" data-testid={`jobs-${status.toLowerCase()}`}>
              {counts[status] ?? 0}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="dead-h" className="space-y-3">
        <h2 id="dead-h" className="text-lg font-medium">
          Failed jobs
        </h2>
        {dead.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has failed. 🎉</p>
        ) : (
          <form action={retryJobAction} aria-label="Failed jobs">
            <div className="border-border overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="p-3">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="p-3">Job</th>
                    <th className="p-3">For</th>
                    <th className="p-3">Tries</th>
                    <th className="p-3">Last error</th>
                    <th className="p-3">Gave up</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {dead.map((j) => (
                    <tr key={j.id} data-testid="dead-job">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="jobId"
                          value={j.id}
                          aria-label={`Retry ${TYPE_LABEL[j.type] ?? j.type} ${subject(j.payload)}`}
                        />
                      </td>
                      <td className="p-3">{TYPE_LABEL[j.type] ?? j.type}</td>
                      <td className="p-3">{subject(j.payload)}</td>
                      <td className="p-3">{j.attempts}</td>
                      <td className="max-w-md p-3 break-words text-red-700">{j.lastError}</td>
                      <td className="p-3">{j.finishedAt ? dateFmt.format(j.finishedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="submit" className="mt-3">
              Retry selected
            </Button>
          </form>
        )}
      </section>

      {failing.length > 0 && (
        <section aria-labelledby="failing-h" className="space-y-3">
          <h2 id="failing-h" className="text-lg font-medium">
            Retrying
          </h2>
          <ul className="divide-border border-border divide-y rounded-md border text-sm">
            {failing.map((j) => (
              <li key={j.id} className="p-3">
                {TYPE_LABEL[j.type] ?? j.type} · try {j.attempts} of {j.maxAttempts} · next{" "}
                {dateFmt.format(j.runAt)}
                <span className="block text-xs text-amber-800">{j.lastError}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
