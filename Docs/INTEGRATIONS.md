# Integrations — setup steps

Every integration is **optional locally**: without its keys the feature falls back gracefully (shown in the `app.start` log line). Secrets go in `.env` (Vercel → Environment Variables in production); non-secret settings in `config/*.ini` (see [`CONFIGURATION.md`](CONFIGURATION.md)).

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
5. Shipping fee: `config/shipping.ini` → `[shipping] fee_rupees` (₹99) unless the subtotal reaches `free_above_rupees` (₹999).

Without Shiprocket keys, the pincode check stays silent and admins use "Mark as shipped / delivered" by hand.

## Product photos — choose a storage provider

Photos uploaded in Admin → Products (and customers' review and return photos) go to one provider, chosen in `config/images.ini`:

| `[images] provider`    | Needs                                                                                                             | Notes                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `cloudinary` (default) | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                                            | Free plan is enough                             |
| `r2`                   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` + `r2_public_url` in `config/images.ini` | Cloudflare R2; no egress fees                   |
| `none`                 | nothing                                                                                                           | No uploads; admins pick from placeholder images |

If the chosen provider's keys are missing, uploads are off and the product form offers placeholder images instead. Every file is checked by its real bytes: JPG, PNG or WebP only (never SVG), up to `[images] max_upload_mb` (5 MB). Uploads go from our server to the provider, so the browser never sees a key.

**Only our own storage is trusted.** A photo or 360° video link is saved only if it is a built-in `/images/…` (`/videos/…`) path, or starts with `https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/` or with `r2_public_url` (`lib/media.ts`). A link to any other site is refused, so nobody can slip outside content into the shop.

### Cloudinary

Set the three `CLOUDINARY_*` variables and keep `provider = cloudinary`. Restart (or redeploy on Vercel).

### Cloudflare R2 (product photos — alternative to Cloudinary)

1. **Create the bucket.** Cloudflare dashboard → **R2 Object Storage** → (first time: add a payment method; the free tier covers a small shop) → **Create bucket** → name e.g. `jewellery-images`, location Automatic. This name goes in `R2_BUCKET`.
2. **Make it publicly readable.** Open the bucket → **Settings → Public access**:
   - **Custom domain (recommended for production):** **Connect domain** → e.g. `images.yourshop.in` (the domain must be on Cloudflare). Wait until it shows _Active_. Public URL = `https://images.yourshop.in`.
   - **r2.dev subdomain (fine for testing):** **Allow access** on the `r2.dev` URL. Cloudflare rate-limits it, so switch to a custom domain before going live. Public URL = the `https://pub-….r2.dev` address shown.
3. **Create an API token.** R2 overview → **Manage R2 API Tokens** (or **API → Manage API tokens**) → **Create API token** → permission **Object Read & Write**, **Specify bucket** → your bucket → Create. Copy the **Access Key ID** and **Secret Access Key** now (the secret is shown only once).
4. **Find your Account ID** on the R2 overview page (right-hand side), or in the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
5. **Set the env vars** in `.env` and in Vercel → Environment Variables:
   ```
   R2_ACCOUNT_ID="…"
   R2_ACCESS_KEY_ID="…"
   R2_SECRET_ACCESS_KEY="…"
   R2_BUCKET="jewellery-images"
   ```
6. **Switch the provider** in `config/images.ini`, commit and deploy:
   ```ini
   [images]
   provider = r2
   r2_public_url = https://images.yourshop.in
   ```
   `r2_public_url` must be `https://`. It is also added to the allowed image hosts in `next.config.ts`, so restart `npm run dev` after changing it.
7. **Test:** Admin → Products → edit a piece → **Upload a photo**. The photo appears in the list; after saving it shows on the product page. Files are stored as `jewellery-store/products/<yyyy-mm>/<random>.jpg` with a one-year cache header. Errors are logged as `upload.failed` with `provider: "r2"`.

**CORS is not needed:** the browser sends the file to our server action, and the server uploads it to R2 (signed with AWS Signature V4 in `lib/storage/sigv4.ts`; no AWS SDK). The bucket only has to be publicly _readable_.

**Switching from Cloudinary to R2 later:** photos already saved keep their Cloudinary links and keep working, but **leave `CLOUDINARY_CLOUD_NAME` set** — without it, existing Cloudinary links are no longer accepted when a product is saved again. New uploads go to R2. Nothing is copied automatically.

**360° videos** are not uploaded through the admin form. Upload the `.mp4`/`.webm` yourself (Cloudinary Media Library, or R2 bucket → **Upload**), then paste its public link into the product's **360° video link** box.

## Google login (optional)

1. https://console.cloud.google.com → create a project → **APIs & Services → OAuth consent screen** (External, add your email as a test user).
2. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
3. Authorised redirect URI: `http://localhost:3000/api/auth/callback/google` (add your live domain's version later).
4. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`, restart. The "Continue with Google" button appears automatically.

## MSG91 (SMS, optional)

Needs a DLT-approved template (India). Set `MSG91_AUTH_KEY`, `MSG91_ORDER_FLOW_ID` in `.env` **and** `[features] sms = true` in `config/features.ini`. Sent for confirmed / shipped / delivered.

## Sentry (error alerts, optional)

`SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (browser). On Vercel, also `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for readable stack traces. Every `logger.error` is sent to Sentry.

## Google Analytics 4 (optional)

`NEXT_PUBLIC_GA_ID` (`G-XXXX`). Loads only after the shopper accepts the cookie banner. Shop funnel counts (view → cart → checkout → purchase) are also kept in our own DB for Admin → Reports.

## Scheduled jobs

`CRON_SECRET` (any long random text) in Vercel. `vercel.json` runs:

- `/api/cron/release-reservations` — daily on the free plan. Releases expired stock holds **and** sends refunds a crash left unsent (PENDING, never reached Razorpay, 10+ minutes old). For faster release of expired stock holds on the free plan, enable `.github/workflows/cron.yml` (repo variable `ENABLE_CRON=true`, secrets `SITE_URL`, `CRON_SECRET`) which calls it every 10 minutes. Holds are also released whenever any checkout starts.
- `/api/cron/low-stock` — daily 09:00 IST email to admins (or `[alerts] admin_email`).

`CRON_SECRET` is required in production: the app refuses to start without it (`lib/env.ts`).

## WhatsApp and showroom visits (no account needed)

- **Ask on WhatsApp** is a plain `https://wa.me/<number>` link with the product name and link pre-filled; no WhatsApp Business API. Enter the number in **Admin → Settings** (10-digit mobile, or with country code). Empty number or `[features] whatsapp_button = false` hides it.
- **Visit requests** from `/visit` are emailed to `[alerts] admin_email` (or every admin) through Resend. The email holds only the date and slot, never the customer's text; details are in Admin → Visits. A failed email never loses the request.
