# Go-live checklist

Tick every line before taking real orders. Keep this file updated; Phase 30 extends it.

## Business and legal

- [ ] Razorpay **KYC approved** and live keys generated
- [ ] GSTIN, legal name, registered address, state, phone, support email filled in (`config.ini` → `[business]`, committed)
- [ ] Grievance officer name and email filled in (`config.ini` → `[grievance_officer]`)
- [ ] Production log has no `app.business_details_incomplete` warning
- [ ] Privacy, Terms, Refunds, Shipping and Contact pages reviewed by a lawyer/CA
- [ ] Real product photos, prices, weights, purity and HUIDs entered; dummy products hidden or deleted

## Accounts and secrets

- [ ] New production `AUTH_SECRET` (not the development one)
- [ ] Production Neon branch, separate from development
- [ ] Admin account created with a strong, unique password
- [ ] Nobody has `.env` files except the people who need them; Neon password reset if it was ever shared

## Switching Razorpay to live

- [ ] In Razorpay switch to **Live Mode** → API Keys → generate live keys
- [ ] On Vercel replace `RAZORPAY_KEY_ID` (`rzp_live_…`) and `RAZORPAY_KEY_SECRET` (Production only — keep test keys on Preview)
- [ ] Live-mode webhook added: `https://<domain>/api/webhooks/razorpay`, events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`, same secret as `RAZORPAY_WEBHOOK_SECRET`
- [ ] Payment capture set to **Automatic** in live mode
- [ ] Redeploy (Vercel → Deployments → Redeploy)

## Site

- [ ] Custom domain connected, HTTPS working, `NEXT_PUBLIC_APP_URL` updated
- [ ] `/api/health` returns ok on the live domain
- [ ] GitHub Actions CI is green on `main`
- [ ] Resend domain verified (SPF, DKIM, DMARC); test order email arrives and isn't in spam
- [ ] Sentry receiving errors (optional but recommended); in Sentry → Alerts add "Number of errors > 25 in 10 minutes" → email
- [ ] Vercel → Settings → Environment Variables → "Automatically expose System Environment Variables" ON (Sentry release tags)
- [ ] Monitoring (Phase 26): `[alerts] admin_email` set; GitHub Actions "Uptime" green (needs ENABLE_CRON, SITE_URL, CRON_SECRET); Admin → System shows the scheduler running and no firing alerts
- [ ] Optional: add `https://<site>/api/health` to a free uptime service (1-minute checks, SMS)
- [ ] **Before deploying Phase 27:** set `PII_ENCRYPTION_KEY` in Vercel (`openssl rand -base64 48`, keep a copy in your password manager — without it saved addresses can't be read). After the deploy, run `npm run pii:encrypt` once against the live database, then `npm run pii:encrypt -- --dry` should show zeros
- [ ] Account → Privacy works on the live site: download your data, and (with a test account) delete it
- [ ] Ask your lawyer / CA to read the privacy policy and terms (B-09)
- [ ] `CRON_SECRET` set; `/api/cron/jobs` returns 200 with the bearer token; GitHub `cron.yml` enabled (`ENABLE_CRON=true`, `SITE_URL`, `CRON_SECRET`)
- [ ] Admin → Jobs shows no failed jobs after a test order (email, invoice, webhook all DONE)
- [ ] Owner signs in to /admin, sets up two-step sign-in on their phone and **stores the 8 recovery codes offline**; staff invited from Admin → Staff with the smallest role that fits
- [ ] `app.start` log line shows `razorpayMode: "live"`, `email: true`, `cronJobs: true`
- [ ] Google login redirect URI updated (if used)

## Production readiness (Phase 30)

- [ ] Restore drill run against production into a Neon branch, result added to `Docs/BACKUPS.md` → Drill log (BL-7)
- [ ] All Vercel Production environment variables copied to the password manager (especially `PII_ENCRYPTION_KEY`, `AUTH_SECRET`)
- [ ] Owner has tried each kill switch once on Admin → System (pause → check the shop → turn back on)
- [ ] Owner has read `Docs/ADMIN_GUIDE.md`; whoever looks after the code has read `Docs/ONBOARDING.md` and `Docs/RUNBOOK.md`
- [ ] Admin → System: every alert OK, cron ran in the last 45 minutes, health "OK"
- [ ] Admin → Jobs: nothing failed
- [ ] Load test passed on the production build (`tests/load`, 2× expected traffic, see LAUNCH.md)
- [ ] `Docs/LAUNCH.md` read: who watches what in the first 24 hours, and how to roll back

## Real-money test (do this last)

- [ ] Add a cheap product (e.g. ₹1–₹10) or temporarily set a price that low
- [ ] Buy it with a real UPI/card on the live site
- [ ] Order shows **Paid** in `/admin/orders`, stock went down, confirmation email arrived
- [ ] Razorpay dashboard shows the payment as **Captured** and the webhook delivery as **200**
- [ ] Cancel the order in `/admin` — this sends the refund automatically (do **not** also refund from the Razorpay dashboard, or the second refund fails). Check the order reaches **Refunded**, then restore the product's real price

## After launch (first week)

- [ ] Check Razorpay webhook deliveries and Sentry daily
- [ ] Check `/admin` for orders waiting to ship every day
