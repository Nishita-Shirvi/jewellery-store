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
- [ ] Sentry receiving errors (optional but recommended)
- [ ] `CRON_SECRET` set; `/api/cron/release-reservations` returns 200 with the bearer token
- [ ] `app.start` log line shows `razorpayMode: "live"`, `email: true`, `cronJobs: true`
- [ ] Google login redirect URI updated (if used)

## Real-money test (do this last)

- [ ] Add a cheap product (e.g. ₹1–₹10) or temporarily set a price that low
- [ ] Buy it with a real UPI/card on the live site
- [ ] Order shows **Paid** in `/admin/orders`, stock went down, confirmation email arrived
- [ ] Razorpay dashboard shows the payment as **Captured** and the webhook delivery as **200**
- [ ] Cancel the order in `/admin` — this sends the refund automatically (do **not** also refund from the Razorpay dashboard, or the second refund fails). Check the order reaches **Refunded**, then restore the product's real price

## After launch (first week)

- [ ] Check Razorpay webhook deliveries and Sentry daily
- [ ] Check `/admin` for orders waiting to ship every day
