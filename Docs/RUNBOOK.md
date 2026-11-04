# Runbook — what to do when an alert arrives

Every alert email links here. Each section says **what it means**, **what to check first**, and **how to fix it**. Alerts email once when they start, remind every `[alerts] repeat_hours` (default 6) while they last, and send a **Resolved** email when they clear. Live status: **Admin → System**. Thresholds: `config.ini` → `[alerts]` (0 switches an alert off).

Useful everywhere:

- **Logs:** Vercel → your project → Logs. Every line is JSON with an `event` name; lines from one request or background job share a `requestId` (and `jobId`). Search either to follow one customer's problem from start to end. API responses carry the id in the `x-request-id` header.
- **Errors:** Sentry (when `SENTRY_DSN` is set) groups errors by cause and shows which release (git commit) introduced them.
- **Jobs:** Admin → Jobs lists failed jobs with their error and a **Retry** button.

---

## Payments are failing

**Means:** in the last `payment_window_minutes` (15), at least `payment_failures_min` (5) payments failed or the payment gateway couldn't be reached, and they were at least `payment_failure_rate_percent` (50%) of attempts. Checked the moment a payment fails, so this arrives within seconds of an outage.

**Check first:**

1. Admin → System → "Last hour": many **payment gateway errors** = we can't reach Razorpay (their outage, or our keys). Many **failed payments** with few gateway errors = customers' payments are being declined.
2. [Razorpay status page](https://status.razorpay.com) and the Razorpay dashboard → Payments → Failed (look at the failure reasons).
3. Logs: search `checkout.razorpay_order_failed` (gateway errors, with the error message) or `payment.failed` (declines, with the reason).

**Fix:**

- Razorpay outage: nothing to fix on our side; consider an announcement bar (Admin → Content): "Card/UPI payments are slow right now — cash on delivery is available" (if COD is on). It resolves by itself.
- `401`/"authentication failed" in the error: the API keys changed or expired → update `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in Vercel → Settings → Environment Variables → redeploy.
- One payment method failing (e.g. all UPI): check Razorpay dashboard → Settings → Payment methods; contact Razorpay support with a failed payment id.

## No orders for a long time

**Means:** no paid or cash-on-delivery order for `no_orders_hours` (48). Only after the first order ever (a new store doesn't alert).

**Check first:** place a test order yourself on the live site (a cheap item; cancel it after). Does the home page load? Can you add to cart, reach checkout, see the Razorpay window?

**Fix:** if the test order works, it's a quiet period (consider a promotion); if it fails, follow the step that broke — usually **Payments are failing** or **Site down** below. Raise `no_orders_hours` if the store normally has slow weeks.

## Background jobs have failed

**Means:** at least one background job (order email, SMS, invoice, Shiprocket shipment, webhook processing, marketing email…) failed all its retries in the last 24 hours.

**Check first:** Admin → Jobs → **Failed** — the type and the last error. Search the logs for its `jobId`.

**Fix:**

- Email jobs: check `RESEND_API_KEY` and the domain's DNS (Resend dashboard → Domains). Then **Retry**.
- `shipment.create`: Shiprocket credentials, pickup location name, or the pincode isn't serviceable; create the shipment by hand in Shiprocket if needed, then retry or leave it.
- `invoice.create`: usually a missing business detail in `config.ini` `[business]`; fix, deploy, retry.
- Anything else: retry once; if it fails again, send the error and `jobId` to the developer.

The alert clears 24 hours after the last failure (retried jobs that succeed no longer count).

## Webhook problems

**Means:** in the last hour, a Razorpay or Shiprocket notification couldn't be processed (it keeps retrying, then fails), or at least `bad_webhook_signatures_per_hour` (10) arrived with a wrong signature/token.

**Check first:** Admin → Jobs (types `webhook.razorpay`, `webhook.shiprocket`) for processing errors; Admin → System → "bad webhook signatures".

**Fix:**

- **Wrong signatures, after you changed a secret:** the webhook secret in Razorpay (Settings → Webhooks) / the API key in Shiprocket must equal `RAZORPAY_WEBHOOK_SECRET` / `SHIPROCKET_WEBHOOK_TOKEN` in Vercel. Update one to match, redeploy, then use "Resend" in the Razorpay webhook log.
- **Wrong signatures, nothing changed:** someone is sending fake events. They are rejected and harmless; nothing to do unless it continues for days.
- **Processing errors:** paid orders are normally confirmed by the customer's browser straight after paying; the webhook is the backup. Retry the job from Admin → Jobs once the cause is fixed, and check Admin → Orders for orders stuck as pending that Razorpay shows as paid.

## Best-sellers out of stock

**Means:** one of the `stockout_top_sellers` (10) best-selling pieces of the last 30 days has nothing left to sell.

**Check first:** the email lists them. Admin → Products → filter low stock.

**Fix:** restock (Admin → Products → the piece → Variants → stock). Customers who asked to be told get a back-in-stock email automatically. If it won't come back, hide the product so it stops appearing in recommendations.

## Many errors

**Means:** at least `error_spike_count` (25) error lines were logged in 10 minutes — something is broken for many visitors.

**Check first:** Sentry → Issues sorted by "events" (the top issue is usually the cause) and its release; or Vercel Logs filtered to `"level":"error"`. Did a deploy just happen?

**Fix:**

- Started right after a deploy: Vercel → Deployments → previous deployment → **Promote to Production** (instant rollback), then send the Sentry issue to the developer.
- Database errors (`P1001`, "can't reach database"): Neon dashboard → is the project suspended or over its limits? See **Site down**.
- External service errors (Razorpay, Shiprocket, Resend): see their status pages; the site keeps working and jobs retry.

## Site down (uptime check failed)

**Means:** the GitHub "Uptime" workflow (every 5 minutes) couldn't load the home page, health check, checkout or webhooks, or the scheduler hasn't run for 45 minutes. GitHub emails the repository owner. (For checks every minute with SMS, add `https://<your-site>/api/health` to a free uptime service such as UptimeRobot or Better Stack.)

**Check first:** open the site yourself; open `/api/health` — `{"status":"ok","db":"ok"}` means the app and database are up. Vercel → Deployments (did the last one fail?) and the [Vercel status page](https://www.vercel-status.com).

**Fix:**

- `db: "error"`: Neon dashboard → project → is it suspended / over the free compute hours? Resume or upgrade; check `DATABASE_URL` hasn't changed.
- Site errors after a deploy: promote the previous deployment (see **Many errors**).
- "Scheduler last ran … ago": GitHub → Actions → "Scheduled jobs" — is it enabled and green? `CRON_SECRET` must match in GitHub secrets and Vercel.

---

## Testing the alerts

- **Admin → System → Run alert checks now** runs every check immediately.
- A payment outage can be rehearsed on a test deployment by setting `RAZORPAY_KEY_SECRET` to a wrong value: five checkout attempts trigger **Payments are failing** within seconds (the automated test does this against a stand-in: `tests/e2e/monitoring.spec.ts`).
