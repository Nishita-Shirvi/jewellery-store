# Configuration

The app has exactly **two** places for settings. Knowing which one a value belongs in prevents most "it works locally but not live" problems.

- **`config.ini` (project root)**
  - What goes there: Business rules and store details: legal name, GSTIN, state, shipping fee, invoice prefix, stock hold time, log level
  - Committed to git?: **Yes**
  - Changes take effect: On the next deploy (or `npm run dev` restart)
- **`.env` locally / Vercel → Env Variables**
  - What goes there: **Secrets** and per-environment URLs: database, Auth secret, Razorpay/Resend/Cloudinary/Shiprocket keys
  - Committed to git?: **Never**
  - Changes take effect: Locally on restart; on Vercel after a **redeploy** (Deployments → Redeploy)

Rule of thumb: _if it would be bad for a stranger to read it, it's `.env`. Otherwise it's `config.ini`._

---

## config.ini

Loaded by `lib/config.ts`, validated with Zod. A typo (e.g. `state = Telengana`, `prefix = inv/`) stops `npm run dev` / `npm run build` with a message like:

```
❌ Invalid settings in config.ini (or its env overrides):
  - [business] state: Invalid option: expected one of "Andhra Pradesh"|...
```

so a bad value can never reach customers.

- **`[business] legal_name, address, email, phone, gstin`**
  - Default: `[placeholders]`
  - Used for: Legal pages, invoices, footer, emails
  - Code that reads it: `lib/business.ts` → `getBusiness()`
- **`[business] state`**
  - Default: `Telangana`
  - Used for: GST: buyer in same state → CGST+SGST, else IGST
  - Code that reads it: `services/order.service.ts` (checkout), `services/invoice.service.ts`
- **`[grievance_officer] name, email`**
  - Default: `[placeholders]`
  - Used for: Legal pages (required by e-commerce rules)
  - Code that reads it: `lib/business.ts`
- **`[invoice] prefix`**
  - Default: `INV`
  - Used for: `INV/2026-27/000001`
  - Code that reads it: `services/invoice.service.ts`
- **`[shipping] fee_rupees`, `free_above_rupees`**
  - Default: `99`, `999`
  - Used for: Shipping fee at checkout
  - Code that reads it: `lib/shipping-config.ts`
- **`[inventory] reservation_minutes`**
  - Default: `15`
  - Used for: How long stock is held while a customer pays
  - Code that reads it: `services/inventory.service.ts`
- **`[inventory] low_stock_threshold`**
  - Default: `3`
  - Used for: "Low stock" on the admin dashboard + daily low-stock email
  - Code that reads it: `services/admin/dashboard.service.ts`, `services/report.service.ts`
- **`[alerts] admin_email`**
  - Default: empty = all admins
  - Used for: Who gets low-stock emails
  - Code that reads it: `services/alert.service.ts`
- **`[features] sms`**
  - Default: `false`
  - Used for: Order SMS through MSG91 (also needs `MSG91_*` keys in `.env`)
  - Code that reads it: `services/notification.service.ts`
- **`[marketing] abandoned_cart`**
  - Default: `true`
  - Used for: Cart reminder emails to signed-in customers
  - Code that reads it: `services/marketing.service.ts`
- **`[marketing] abandoned_first_minutes` / `abandoned_second_hours`**
  - Default: `60` / `24`
  - Used for: When the 1st and 2nd reminders go
  - Code that reads it: `lib/marketing.ts`
- **`[marketing] abandoned_coupon_percent`**
  - Default: `0`
  - Used for: % off coupon (single use, personal) in the 2nd reminder; 0 = none
  - Code that reads it: `services/marketing.service.ts`
- **`[marketing] referral_reward_rupees` / `referral_min_order_rupees`**
  - Default: `500` / `2000`
  - Used for: Referrer's reward coupon and its minimum order; 0 = referrals off
  - Code that reads it: `services/marketing.service.ts`
- **`[support] notify_email`**
  - Default: (business email)
  - Used for: Where new tickets and customer replies are emailed
  - Code that reads it: `services/marketing-email.service.ts`
- **`[support] whatsapp_number`**
  - Default: (empty = off)
  - Used for: WhatsApp number with country code for a "Chat on WhatsApp" button
  - Code that reads it: `lib/support.ts`
- **`[festivals] akshaya_tritiya` / `dhanteras` / `diwali` / `wedding_season`**
  - Default: see config.ini
  - Used for: Date ranges `YYYY-MM-DD..YYYY-MM-DD` offered as one-click dates when scheduling content. Lunar calendar: update every year
  - Code that reads it: `services/merch.service.ts`
- **`[alerts] no_orders_hours` … `repeat_hours`**
  - Default: see config.ini
  - Used for: Business alert thresholds (0 = off); what to do for each: Docs/RUNBOOK.md
  - Code that reads it: `services/monitor.service.ts`
- **`[privacy] otp_days` … `audit_log_days`**
  - Default: see config.ini
  - Used for: How long data no longer needed is kept before the daily clean-up; shown in the privacy policy
  - Code that reads it: `services/privacy.service.ts`
- **`[cod] enabled`**
  - Default: `true`
  - Used for: Offer cash on delivery at checkout
  - Code that reads it: `lib/cod.ts`, `services/order.service.ts`
- **`[cod] max_order_rupees`**
  - Default: `10000`
  - Used for: Largest order total (incl. shipping + fee) allowed on COD — kept low on purpose
  - Code that reads it: `lib/cod.ts`
- **`[cod] fee_rupees`**
  - Default: `0`
  - Used for: Extra COD fee, added to the total and to the invoice
  - Code that reads it: `lib/cod.ts`, `services/invoice.service.ts`
- **`[cod] pincodes`**
  - Default: (empty = all)
  - Used for: Comma-separated pincodes / prefixes where COD is allowed, e.g. `500, 560001`
  - Code that reads it: `lib/cod.ts`
- **`[cod] max_refusals`**
  - Default: `2`
  - Used for: Refused COD parcels after which a customer must pay online
  - Code that reads it: `lib/cod.ts`, `services/shipment.service.ts`
- **`[cod] otp_required`**
  - Default: `true`
  - Used for: SMS one-time code before every COD order (needs `MSG91_OTP_TEMPLATE_ID`)
  - Code that reads it: `services/otp.service.ts`
- **`[logging] level`**
  - Default: `info`
  - Used for: `debug` / `info` / `warn` / `error` — see `LOGGING.md`
  - Code that reads it: `lib/logger.ts`

### Overriding a value for one environment

Any key can be overridden with an env var named `SECTION_KEY` in capitals. Env wins over the file.

```
[shipping] fee_rupees   →  SHIPPING_FEE_RUPEES=0
[logging]  level        →  LOGGING_LEVEL=debug
[business] gstin        →  BUSINESS_GSTIN=36ABCDE1234F1Z5
```

Typical use: turn on `LOGGING_LEVEL=debug` on Vercel for an hour while chasing a bug, then remove it and redeploy — no code change, no commit.

Older env names from before `config.ini` existed still work: `FREE_SHIPPING_ABOVE_RUPEES`, `FEATURE_SMS`, `ADMIN_ALERT_EMAIL`, `LOG_LEVEL`.

> **Upgrading an existing `.env` (made before 2026-10-25):** delete the lines `BUSINESS_*`, `GRIEVANCE_OFFICER_*`, `INVOICE_PREFIX`, `SHIPPING_FEE_RUPEES`, `FREE_SHIPPING_ABOVE_RUPEES`, `FEATURE_SMS`, `ADMIN_ALERT_EMAIL` from `.env` and from Vercel. If you leave them, they **override** `config.ini` (e.g. the old `[placeholder]` business name would win over your real one). The `app.start` log line lists every active override under `configOverriddenByEnv`.

### Adding a new setting

1. Add the key with a comment to `config.ini`.
2. Add it to `configSchema` in `lib/config.ts` with a default and validation.
3. Read it with `import { config } from "@/lib/config"` — **server code only** (it reads a file; it cannot run in the browser or in `middleware.ts`).
4. Add a row to the table above and a test in `tests/config.test.ts` if it has rules.

### How config.ini reaches Vercel

`next.config.ts` has `outputFileTracingIncludes: { "/**": ["./config.ini"] }`, which copies the file into every serverless function. `next.config.ts` also imports `lib/config.ts` so the build fails if the file is invalid.

---

## .env (secrets)

Full commented list: `.env.example`. Validated by `lib/env.ts` the same way — a missing required value stops the app at startup.

- **`DATABASE_URL`, `DIRECT_URL`**
  - Required?: Yes
  - Without it: App doesn't start
- **`AUTH_SECRET`**
  - Required?: Yes (32+ chars)
  - Without it: App doesn't start
- **`NEXT_PUBLIC_APP_URL`**
  - Required?: Yes in production
  - Without it: Links in emails/sitemap point to localhost
- **`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`**
  - Required?: To take payments
  - Without it: Checkout shows "payments not set up"
- **`RESEND_API_KEY`, `EMAIL_FROM`**
  - Required?: To send email
  - Without it: Emails are only written to the log (`email.skipped_no_api_key`)
- **`CLOUDINARY_*`**
  - Required?: To upload photos
  - Without it: Admin picks from placeholder images
- **`SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN`**
  - Required?: For automatic shipping
  - Without it: Admin marks orders shipped by hand
- **`CRON_SECRET`**
  - Required?: In production
  - Without it: Cron endpoints return 503 → expired stock holds aren't released
- **`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`**
  - Required?: Optional
  - Without it: "Continue with Google" is hidden
- **`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`**
  - Required?: Optional
  - Without it: No error alerts (logs still work)
- **`NEXT_PUBLIC_GA_ID`**
  - Required?: Optional
  - Without it: No Google Analytics

**Quick check of what is switched on:** every server start logs one line `app.start` with `integrations: { razorpay: true, email: false, … }` (yes/no only, never the values). See `LOGGING.md`.
