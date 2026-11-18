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

- [ ] **Admin → Gold rates:** today's rate per gram entered for every purity you sell (at least 22K and 24K, which the rate bar shows by default). Dashboard shows no "Metal rates are older than…" warning
- [ ] Each product set to **Fixed price** or **Follows today's metal rate**; rate-linked pieces have net weight, making charge and stone charge filled in, and the price breakup on the product page looks right
- [ ] Someone is named to update the rates **every morning**
- [ ] **Admin → Settings:** showroom address, opening hours, showroom phone, WhatsApp number and Google Maps link filled in; contact page checked
- [ ] Tap **Ask on WhatsApp** on a product from a phone — the message reaches the shop's WhatsApp
- [ ] Book a test visit on `/visit` — the alert email arrives and the request is in **Admin → Visits**; then mark it Cancelled
- [ ] **Occasions** ticked on every product (the home page tiles, filters and style advisor depend on them)
- [ ] **Sizes** entered for rings and bangles that need them; `/size-guide` matches how the workshop sizes
- [ ] Feature switches in `config/features.ini` agreed (visit booking, WhatsApp button, rate bar, style advisor) and the announcement text in `config/storefront.ini` is correct

## Accounts and secrets

- [ ] New production `AUTH_SECRET` (not the development one)
- [ ] Production Neon branch, separate from development
- [ ] Admin account created with a strong, unique password
- [ ] Nobody has `.env` files except the people who need them; Neon password reset if it was ever shared
- [ ] Image storage chosen (`config/images.ini` → `provider`) and its keys set on Vercel (`CLOUDINARY_*` or `R2_*` + `r2_public_url`); a test photo uploads. For R2: bucket on a **custom domain**, not the rate-limited `r2.dev` address
- [ ] `SEED_ALLOW_PROD` is **not** set on Vercel

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
- [ ] `CRON_SECRET` set (production refuses to start without it); `/api/cron/release-reservations` returns 200 with the bearer token
- [ ] Production build log shows `prisma migrate deploy` ran (and no `Unsafe production settings` error); `RUN_MIGRATIONS` is not set on Production
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
- [ ] Update gold rates every morning; answer new visit requests the same day
