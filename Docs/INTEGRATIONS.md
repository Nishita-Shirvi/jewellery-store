# Integrations — setup steps

Every integration is **optional locally**: without its keys the feature falls back gracefully (shown in the `app.start` log line). Secrets go in `.env` (Vercel → Environment Variables in production); non-secret settings in `config.ini` (see `CONFIGURATION.md`).

## Razorpay (payments) — required to take orders

1. Create a Razorpay account → switch to **Test Mode** → **Account & Settings → API Keys → Generate Test Key**.
2. Put the Key ID and Key Secret in `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and any long random text in `RAZORPAY_WEBHOOK_SECRET`. Restart `npm run dev`.
3. Add items to the cart → Checkout → add an address → **Pay**. In test mode use UPI ID `success@razorpay` (or a test card from Razorpay's docs).
4. After paying you land on `/orders/<id>/success`; the order is PAID, stock goes down and the cart empties.
5. **After deploying** (Razorpay can't reach `localhost`): Dashboard → Webhooks → URL `https://<your-domain>/api/webhooks/razorpay`, secret = the same `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`. Locally, the verified checkout callback marks orders as paid.
6. Going live: replace the test keys with live keys (needs KYC) — `GO_LIVE_CHECKLIST.md`.

## Resend (email)

- Set `RESEND_API_KEY` and `EMAIL_FROM`. Without a key, emails are only written to the log (`email.skipped_no_api_key`).
- Until you verify your own domain in Resend, it only delivers to the address you signed up with. Domain + SPF/DKIM/DMARC steps: `DEPLOY.md`.
- Customers get emails when an order is confirmed, shipped, delivered, cancelled, refunded, and at each return step. Template: `emails/order-email.tsx`.

## Shiprocket (shipping)

1. Shiprocket → **Settings → API → Add New API User** (use a different email from your login). Put that email/password in `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`.
2. **Settings → Pickup Addresses**: the pickup location's name → `SHIPROCKET_PICKUP_LOCATION` (default "Primary") and its pincode → `SHIPROCKET_PICKUP_PINCODE`.
3. After deploying: **Settings → API → Webhooks** → URL `https://<your-domain>/api/webhooks/courier-updates`, token = any long random text, also put in `SHIPROCKET_WEBHOOK_TOKEN`. (Shiprocket rejects webhook URLs containing the word "shiprocket" — that's why the path is `courier-updates`.)
4. In `/admin/orders/<id>` press **Create shipment** on a paid order → courier, AWB, label PDF and tracking link appear; tracking updates move the order to Shipped and Delivered automatically.
5. Shipping fee: `config.ini` → `[shipping] fee_rupees` (₹99) unless the subtotal reaches `free_above_rupees` (₹999).

Without Shiprocket keys, the pincode check stays silent and admins use "Mark as shipped / delivered" by hand.

## Cloudinary (product photos)

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (free plan is enough). Without them, admins pick from placeholder images. Max 5 MB; JPG, PNG or WebP.

## Google login (optional)

1. https://console.cloud.google.com → create a project → **APIs & Services → OAuth consent screen** (External, add your email as a test user).
2. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
3. Authorised redirect URI: `http://localhost:3000/api/auth/callback/google` (add your live domain's version later).
4. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, restart. The "Continue with Google" button appears automatically.

## MSG91 (SMS, optional)

Needs a DLT-approved template (India). Set `MSG91_AUTH_KEY`, `MSG91_ORDER_FLOW_ID` in `.env` **and** `[features] sms = true` in `config.ini`. Sent for confirmed / shipped / delivered.

## Sentry (error alerts, optional)

`SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser). On Vercel, also `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for readable stack traces. Every `logger.error` is sent to Sentry.

## Google Analytics 4 (optional)

`NEXT_PUBLIC_GA_ID` (`G-XXXX`). Loads only after the shopper accepts the cookie banner. Shop funnel counts (view → cart → checkout → purchase) are also kept in our own DB for Admin → Reports.

## Scheduled jobs

`CRON_SECRET` (any long random text) in Vercel. `vercel.json` runs:

- `/api/cron/release-reservations` — daily on the free plan. For faster release of expired stock holds on the free plan, enable `.github/workflows/cron.yml` (repo variable `ENABLE_CRON=true`, secrets `SITE_URL`, `CRON_SECRET`) which calls it every 10 minutes. Holds are also released whenever any checkout starts.
- `/api/cron/low-stock` — daily 09:00 IST email to admins (or `[alerts] admin_email`).
