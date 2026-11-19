# Go-live checklist

Tick every line before taking real orders. Keep this file updated; Phase 30 extends it.

## Business and legal

- [ ] Razorpay **KYC approved** and live keys generated
- [ ] GSTIN, legal name, registered address, state, phone, support email filled in (`config/business.ini` → `[business]`, committed)
- [ ] Grievance officer name and email filled in (`config/business.ini` → `[grievance_officer]`)
- [ ] Production log has no `app.business_details_incomplete` warning (while it shows, **no invoices are created**)
- [ ] Return window agreed and set (`config/shipping.ini` → `[returns] window_days`); refund policy page reviewed with that number
- [ ] Privacy, Terms, Refunds, Shipping and Contact pages reviewed by a lawyer/CA
- [ ] Real product photos, prices, weights, purity and HUIDs entered; dummy products deleted (never-ordered pieces can be deleted) or hidden

## Shop set-up in the admin panel (see `ADMIN_GUIDE.md`)

- [ ] **Admin → Gold rates:** today's rate per gram entered for every purity you sell (at least 22K and 24K, which the rate strip shows by default). Dashboard shows no "Metal rates are older than…" warning
- [ ] Each product set to **Fixed price** or **Follows today's metal rate**; rate-linked pieces have net weight on every variant, making charge and stone charge filled in, and the price looks right
- [ ] Someone is named to update the rates **every morning**
- [ ] **Admin → Showroom:** showroom address, opening hours, phone, WhatsApp number and Google Maps link filled in; contact page checked
- [ ] Tap **Chat on WhatsApp** on a product from a phone — the message reaches the shop's WhatsApp
- [ ] Book a test visit on `/visit` — the alert email arrives and the request is in **Admin → Visits**; then mark it Cancelled
- [ ] **Occasion tags** (`bridal`, `festive`, `daily-wear`, `office-wear`, `gift`, `party`) on every product — the home page tiles, filters and style advisor depend on them
- [ ] Rings and bangles have their sizes as **variants**; `/size-guide` matches how the workshop sizes
- [ ] Feature switches in `config/features.ini` agreed (visit booking, WhatsApp button, rate strip, style advisor) and the announcement text in `config/storefront.ini` is correct
- [ ] Image storage chosen (`config/images.ini` → `provider`) and its keys set on Vercel (`CLOUDINARY_*` or `R2_*` + `r2_public_url`); a test photo uploads. For R2: bucket on a **custom domain**, not the rate-limited `r2.dev` address
- [ ] `SEED_ALLOW_PROD` is **not** set on Vercel

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
- [ ] Production build log shows `prisma migrate deploy` ran (and no `Unsafe production settings` error); `RUN_MIGRATIONS` is not set on Production
- [ ] `CRON_SECRET` set (production refuses to start without it); `/api/cron/jobs` returns 200 with the bearer token; GitHub `cron.yml` enabled (`ENABLE_CRON=true`, `SITE_URL`, `CRON_SECRET`)
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
- [ ] Update gold rates every morning; answer new visit requests the same day
