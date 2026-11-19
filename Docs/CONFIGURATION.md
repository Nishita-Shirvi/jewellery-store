# Configuration

The app has **three** places for settings. Knowing which one a value belongs in prevents most "it works locally but not live" problems.

- **`config/*.ini` (one file per topic)**
  - What goes there: Business rules and store details: legal name, GSTIN, state, shipping fee, return window, COD rules, invoice prefix, stock hold time, image storage, switches, log level
  - Who changes it: Developer
  - Committed to git?: **Yes**
  - Changes take effect: On the next deploy (or `npm run dev` restart)
- **`.env` locally / Vercel → Env Variables**
  - What goes there: **Secrets** and per-environment URLs: database, Auth secret, Razorpay/Resend/Cloudinary/R2/Shiprocket keys
  - Who changes it: Developer
  - Committed to git?: **Never**
  - Changes take effect: Locally on restart; on Vercel after a **redeploy** (Deployments → Redeploy)
- **Admin panel (stored in the database)**
  - What goes there: Things the shop team changes day to day: today's gold rates (**Admin → Gold rates**), showroom address, hours, phone, WhatsApp number and map link (**Admin → Showroom**), plus the content screens (banners, collections, pages, FAQs)
  - Who changes it: Shop team
  - Changes take effect: Immediately, no deploy

Rule of thumb: _if it would be bad for a stranger to read it, it's `.env`. If the shop team needs to change it without a developer, it's in the admin panel. Otherwise it's `config/`._

---

## config/

Every `config/*.ini` file is read at start-up by `lib/config.ts`, merged and validated with Zod. A bad value (e.g. `state = Telengana`, `prefix = inv/`) stops `npm run dev` / `npm run build` with a message like:

```
❌ Invalid settings in config/*.ini (or its env overrides):
  - [business] state: Invalid option: expected one of "Andhra Pradesh"|...
```

so a bad value can never reach customers. A short overview for whoever opens the folder is in [`config/README.md`](../config/README.md).

### File rules

- **One topic per file.** Each `[section]` may appear in only **one** file. The same section in two files stops start-up with a message naming both files.
- Comments go **on their own line**, starting with `;` or `#`. There are no comments after a value: in `address = Shop #12, MG Road` everything after `=` is the value. Optional quotes around a value are removed.
- An **empty** value (`admin_email =`) means "use the default".
- Section and key names are case-insensitive.
- A **misspelled or unknown section or key name** stops start-up with a message naming it.
- Never put secrets here (API keys, passwords, database URLs).

### Which file holds what

- `business.ini` — `[business]`, `[grievance_officer]`, `[invoice]`
- `shipping.ini` — `[shipping]`, `[returns]`, `[cod]`
- `pricing.ini` — `[pricing]`
- `storefront.ini` — `[storefront]`
- `inventory.ini` — `[inventory]`, `[alerts]`
- `images.ini` — `[images]`
- `features.ini` — `[features]`, `[logging]`
- `marketing.ini` — `[marketing]`, `[festivals]`
- `customer.ini` — `[support]`, `[privacy]`

### Every key

#### business.ini — legal and tax details (rarely changes)

- **`[business] legal_name, address, email, phone, gstin`**
  - Default: `[placeholders]`
  - Used for: Legal pages, invoices, footer, emails. Placeholders block invoices (see below)
  - Code that reads it: `lib/business.ts` → `getBusiness()`
- **`[business] state`**
  - Default: `Telangana`
  - Used for: GST: buyer in same state → CGST+SGST, else IGST. Must be the exact official state name
  - Code that reads it: `services/order.service.ts` (checkout), `services/invoice.service.ts`
- **`[grievance_officer] name, email`**
  - Default: `[placeholders]`
  - Used for: Legal pages (required by e-commerce rules)
  - Code that reads it: `lib/business.ts`
- **`[invoice] prefix`**
  - Default: `INV`
  - Used for: `INV/2026-27/000001`. Capital letters, digits and `-`, max 10. Tell your CA before changing it mid-year
  - Code that reads it: `services/invoice.service.ts`

While any business detail is still a `[placeholder]`, **no invoice is created** (log `invoice.skipped_business_details_incomplete`), so no invoice number is wasted. Fill the details in, deploy, then press **Generate invoice** on the paid orders in admin.

#### shipping.ini — delivery, returns and cash on delivery

- **`[shipping] fee_rupees`, `free_above_rupees`**
  - Default: `99`, `999`
  - Used for: Shipping fee at checkout; free at or above the threshold. `free_above_rupees` is also the `{free_above}` in the `[storefront] announcement` text
  - Code that reads it: `lib/shipping-config.ts`, `components/layout/rate-strip.tsx`
- **`[returns] window_days`**
  - Default: `7` (0–60)
  - Used for: Days after delivery a customer may ask for a return. `0` turns returns off. Shown on product pages, the refund policy, the return page and the "delivered" message
  - Code that reads it: `services/return.service.ts`, `lib/returns.ts`
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

#### pricing.ini — gold-rate safety limits

Today's rates themselves are **not** here: the shop team enters them in **Admin → Gold rates** (no deploy).

- **`[pricing] large_change_percent`**
  - Default: `15` (1–100)
  - Used for: A rate that moves more than this % must be confirmed with a tick box (catches typing the rate per 10 g instead of per gram)
  - Code that reads it: `services/metal-rate.service.ts` (`saveRates`), `app/admin/rates/page.tsx`
- **`[pricing] stale_after_hours`**
  - Default: `36`
  - Used for: Admin dashboard warns when the rates are older than this
  - Code that reads it: `services/metal-rate.service.ts`
- **`[pricing] strip_purities`**
  - Default: `K22,K24`
  - Used for: Rates shown in the strip at the top of the header, in order. Any of `K24, K22, K18, K14, S925, PT950`; max 4
  - Code that reads it: `components/layout/rate-strip.tsx`

#### storefront.ini — what shoppers see

Showroom address, hours, phone, WhatsApp number and map link are **not** here: they are in **Admin → Showroom**.

- **`[storefront] announcement`**
  - Default: `Free insured shipping above ₹{free_above}. Every gold piece is BIS hallmarked.`
  - Used for: The standing message in the rate strip (max 160 characters). Shown alone when there are no rates (or the rate strip is off); next to the rates on wide screens. Time-limited offers go in the scheduled announcement bar (**Admin → Content**), which shows above the strip
  - Code that reads it: `components/layout/rate-strip.tsx`
- **`[storefront] featured_count`**
  - Default: `8` (0–24)
  - Used for: Featured pieces on the built-in home page
  - Code that reads it: `app/page.tsx`
- **`[storefront] home_reviews`**
  - Default: `3` (0–12)
  - Used for: Recent 4–5 star published reviews on the built-in home page; `0` hides the section
  - Code that reads it: `app/page.tsx`, `services/review.service.ts`

#### inventory.ini — stock holds and alerts

- **`[inventory] reservation_minutes`**
  - Default: `15`
  - Used for: How long stock is held while a customer pays
  - Code that reads it: `services/inventory.service.ts`
- **`[inventory] low_stock_threshold`**
  - Default: `3`
  - Used for: "Low stock" on the admin dashboard, the admin products filter and the daily low-stock email
  - Code that reads it: `services/admin/dashboard.service.ts`, `services/admin/product-admin.service.ts`, `services/report.service.ts`
- **`[alerts] admin_email`**
  - Default: empty = all admins
  - Used for: Who gets low-stock emails, business alerts and showroom-visit alerts
  - Code that reads it: `services/alert.service.ts`, `services/monitor.service.ts`, `services/visit.service.ts`
- **`[alerts] no_orders_hours` … `repeat_hours`**
  - Default: see `config/inventory.ini`
  - Used for: Business alert thresholds (0 = off); what to do for each: `Docs/RUNBOOK.md`
  - Code that reads it: `services/monitor.service.ts`

#### images.ini — where photos are stored (set once)

- **`[images] provider`**
  - Default: `cloudinary`
  - Used for: `cloudinary` (needs `CLOUDINARY_*` in `.env`), `r2` (Cloudflare R2, needs `R2_*` in `.env` + `r2_public_url`), or `none` (no uploads; admins pick placeholder images)
  - Code that reads it: `services/upload.service.ts`
- **`[images] max_upload_mb`**
  - Default: `5` (1–20)
  - Used for: Largest photo an admin or customer can upload. Also sets the server-action body limit in `next.config.ts`
  - Code that reads it: `services/upload.service.ts`, `next.config.ts`
- **`[images] r2_public_url`**
  - Default: empty
  - Used for: Public `https://` address of the R2 bucket (custom domain or `r2.dev`). Also allowed in `next/image`, in the Content-Security-Policy and in saved image/video links
  - Code that reads it: `services/upload.service.ts`, `lib/media.ts`, `next.config.ts`

Setup steps for R2: [`INTEGRATIONS.md`](INTEGRATIONS.md).

#### features.ini — switches and log level

- **`[features] sms`**
  - Default: `false`
  - Used for: Order SMS through MSG91 (also needs `MSG91_*` keys in `.env`)
  - Code that reads it: `services/notification.service.ts`
- **`[features] visit_booking`**
  - Default: `true`
  - Used for: `/visit` page, "See it in the showroom" button, home page invite, footer link, **Admin → Visits** and the dashboard visit count. Off → `/visit` is a 404
  - Code that reads it: `app/visit/*`, `app/products/[slug]/page.tsx`, `app/page.tsx`, `app/admin/layout.tsx`
- **`[features] whatsapp_button`**
  - Default: `true`
  - Used for: Every "Chat on WhatsApp" button (product, contact, visit, help centre, checkout, support tickets). Also needs a number in Admin → Showroom or `[support] whatsapp_number`
  - Code that reads it: `lib/support.ts` and the pages above
- **`[features] rate_strip`**
  - Default: `true`
  - Used for: Today's rates in the strip at the top of the header (also needs rates in Admin → Gold rates)
  - Code that reads it: `components/layout/rate-strip.tsx`
- **`[features] style_advisor`**
  - Default: `true`
  - Used for: `/style-advisor` and its links. Off → 404
  - Code that reads it: `app/style-advisor/page.tsx`
- **`[logging] level`**
  - Default: `info`
  - Used for: `debug` / `info` / `warn` / `error` — see `LOGGING.md`
  - Code that reads it: `lib/logger.ts`

**Admin → Showroom** also shows the current state of these switches, the image provider, the return window and the shipping fee (read-only), so the shop team can see them without opening the code.

#### marketing.ini — reminders, referrals, festival dates

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
- **`[festivals] akshaya_tritiya` / `dhanteras` / `diwali` / `wedding_season`**
  - Default: see `config/marketing.ini`
  - Used for: Date ranges `YYYY-MM-DD..YYYY-MM-DD` offered as one-click dates when scheduling content. Lunar calendar: update every year
  - Code that reads it: `services/merch.service.ts`

#### customer.ini — customer care and privacy

- **`[support] notify_email`**
  - Default: (business email)
  - Used for: Where new tickets and customer replies are emailed
  - Code that reads it: `services/marketing-email.service.ts`
- **`[support] whatsapp_number`**
  - Default: (empty)
  - Used for: Fallback number for every "Chat on WhatsApp" button, used only when no number is set in **Admin → Showroom**. With country code (e.g. `919876543210`); a bare 10-digit number gets `91` added
  - Code that reads it: `lib/support.ts`
- **`[privacy] otp_days` … `audit_log_days`**
  - Default: see `config/customer.ini`
  - Used for: How long data no longer needed is kept before the daily clean-up; shown in the privacy policy
  - Code that reads it: `services/privacy.service.ts`

### Overriding a value for one environment

Any key can be overridden with an env var named `SECTION_KEY` in capitals. Env wins over the file. The file a section lives in doesn't matter.

```
[shipping] fee_rupees      →  SHIPPING_FEE_RUPEES=0
[logging]  level           →  LOGGING_LEVEL=debug
[business] gstin           →  BUSINESS_GSTIN=36ABCDE1234F1Z5
[images]   provider        →  IMAGES_PROVIDER=none
[features] visit_booking   →  FEATURES_VISIT_BOOKING=false
```

Typical use: turn on `LOGGING_LEVEL=debug` on Vercel for an hour while chasing a bug, then remove it and redeploy — no code change, no commit.

Older env names from before the config files existed still work: `FREE_SHIPPING_ABOVE_RUPEES`, `FEATURE_SMS`, `ADMIN_ALERT_EMAIL`, `LOG_LEVEL`.

> **Upgrading an existing `.env` (made before 2026-10-25):** delete the lines `BUSINESS_*`, `GRIEVANCE_OFFICER_*`, `INVOICE_PREFIX`, `SHIPPING_FEE_RUPEES`, `FREE_SHIPPING_ABOVE_RUPEES`, `FEATURE_SMS`, `ADMIN_ALERT_EMAIL` from `.env` and from Vercel. If you leave them, they **override** `config/` (e.g. the old `[placeholder]` business name would win over your real one). The `app.start` log line lists every active override under `configOverriddenByEnv`.

> **Upgrading from the single `config.ini` (before 2026-11-19):** the file was split into `config/*.ini` with the same section and key names, so env overrides keep working. Copy any values you had edited into the matching file (see "Which file holds what" above) and delete `config.ini` — it is no longer read. If a value had a comment after it on the same line, move the comment to its own line: it would now be read as part of the value.

### Adding a new setting

1. Add the key with a comment (on its own line) to the `config/*.ini` file whose topic fits. A new section may go in any one file — but only one.
2. Add it to `configSchema` in `lib/config.ts` with a default and validation.
3. Read it with `import { config } from "@/lib/config"` — **server code only** (it reads files; it cannot run in the browser or in `middleware.ts`). Pass the value to client components as a prop.
4. Add it to the list above, a line to `config/README.md` if it's a new file, and a test in `tests/config.test.ts` if it has rules.

### How config/ reaches Vercel

`next.config.ts` has `outputFileTracingIncludes: { "/**": ["./config/*.ini"] }`, which copies the files into every serverless function. `next.config.ts` also imports `lib/config.ts`, so the build fails if a file is invalid. If the `config/` folder is missing entirely, the schema defaults (plus env overrides) are used — fine for tests, never for production.

---

## Admin panel settings (database)

- **Admin → Gold rates** (`/admin/rates`)
  - What: Selling rate per gram for 24K, 22K, 18K, 14K, 925 silver, PT950
  - Stored in: `MetalRate` table (newest row per purity = current; older rows = history)
  - Read by: `services/metal-rate.service.ts`
- **Admin → Showroom** (`/admin/settings`)
  - What: Showroom address, opening hours, phone, WhatsApp number, Google Maps link
  - Stored in: `AppSetting` row with key `storefront`
  - Read by: `services/storefront.service.ts`

Both are cached and refreshed the moment an admin saves. A hand-edited `AppSetting` row that fails validation is ignored (defaults are used, log `storefront.invalid_settings_row`). The contact page falls back to `[business] phone` when no showroom phone is set. Legal and GST details stay in `config/business.ini`. Step-by-step for the shop team: [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md).

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
- **`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`**
  - Required?: When `[images] provider = cloudinary`
  - Without it: Admin picks from placeholder images
- **`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`**
  - Required?: When `[images] provider = r2` (plus `[images] r2_public_url`)
  - Without it: Admin picks from placeholder images
- **`SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN`**
  - Required?: For automatic shipping
  - Without it: Admin marks orders shipped by hand
- **`CRON_SECRET`**
  - Required?: In production
  - Without it: Production refuses to start; locally cron endpoints return 503 → expired stock holds aren't released
- **`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`**
  - Required?: Optional
  - Without it: "Continue with Google" is hidden
- **`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`**
  - Required?: Optional
  - Without it: No error alerts (logs still work)
- **`NEXT_PUBLIC_GA_ID`**
  - Required?: Optional
  - Without it: No Google Analytics
- **`RUN_MIGRATIONS`**
  - Required?: Optional, Vercel previews only
  - Without it: `1` = run `prisma migrate deploy` on a preview build (only for a preview with its **own** database). See `DEPLOY.md`

**Production safety check.** When `VERCEL_ENV=production`, `lib/env.ts` (`productionProblems()`) refuses to start unless `NEXT_PUBLIC_APP_URL` is an `https://` address that isn't localhost, `CRON_SECRET` is set, and the test-only overrides (`RAZORPAY_API_BASE`, `CLOUDINARY_API_BASE`, `SHIPROCKET_API_BASE`) are unset or at their real values. The error starts with `❌ Unsafe production settings:`.

Keep `CLOUDINARY_CLOUD_NAME` set as long as any saved product, review or return photo still points at Cloudinary — even after switching to R2. Saved links are only accepted from **our** Cloudinary cloud or **our** R2 address (`r2_public_url`), see `lib/media.ts`.

**Quick check of what is switched on:** every server start logs one line `app.start` with `integrations: { razorpay: true, email: false, … }` (yes/no only, never the values). See `LOGGING.md`.
