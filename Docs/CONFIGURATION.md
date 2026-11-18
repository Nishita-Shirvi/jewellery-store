# Configuration

The app has **three** places for settings. Knowing which one a value belongs in prevents most "it works locally but not live" problems.

| Where                                   | What goes there                                                                                                                                            | Who changes it | Committed to git? | Changes take effect                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------- | --------------------------------------------------------------------------- |
| `config/*.ini` (one file per topic)     | Business rules and store details: legal name, GSTIN, state, shipping fee, return window, invoice prefix, stock hold time, image storage, switches          | Developer      | **Yes**           | On the next deploy (or `npm run dev` restart)                               |
| `.env` locally / Vercel → Env Variables | **Secrets** and per-environment URLs: database, Auth secret, Razorpay/Resend/Cloudinary/R2/Shiprocket keys                                                 | Developer      | **Never**         | Locally on restart; on Vercel after a **redeploy** (Deployments → Redeploy) |
| Admin panel (stored in the database)    | Things the shop team changes day to day: today's gold rates (**Admin → Gold rates**), showroom address, hours, phone, WhatsApp, map (**Admin → Settings**) | Shop team      | — (database)      | Immediately, no deploy                                                      |

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

- **One topic per file.** Each `[section]` may appear in only **one** file. Defining the same section in two files stops the app: `❌ [shipping] is defined in both config/a.ini and config/b.ini. Keep it in one file.`
- Comments start with `;` or `#` at the start of a line. There are no comments after a value: `address = Shop #12, MG Road` is kept whole. Optional quotes around a value are removed.
- An **empty** value (`admin_email =`) means "use the default".
- Section and key names are case-insensitive.
- A **misspelled section or key name** stops `npm run dev` / `npm run build` with a message naming it.
- Never put secrets here (API keys, passwords, database URLs).

### Every file and key

#### `config/business.ini` — legal and tax details (rarely changes)

| Section / key                                         | Default          | Used for                                                                                              | Code that reads it                                                    |
| ----------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `[business] legal_name, address, email, phone, gstin` | `[placeholders]` | Legal pages, invoices, footer, emails. Placeholders block invoices (below).                           | `lib/business.ts` → `getBusiness()`                                   |
| `[business] state`                                    | `Telangana`      | GST: buyer in same state → CGST+SGST, else IGST. Exact official state name.                           | `services/order.service.ts` (checkout), `services/invoice.service.ts` |
| `[grievance_officer] name, email`                     | `[placeholders]` | Legal pages (required by the e-commerce rules)                                                        | `lib/business.ts`                                                     |
| `[invoice] prefix`                                    | `INV`            | `INV/2026-27/000001`. Capital letters, digits, `-`; max 10. Tell your CA before changing it mid-year. | `services/invoice.service.ts`                                         |

While any business detail is still a `[placeholder]`, **no invoice is created** (log `invoice.skipped_business_details_incomplete`), so no invoice number is wasted. Fill the details in, deploy, then press **Generate invoice** on the paid orders in admin.

#### `config/shipping.ini` — delivery and returns

| Section / key                  | Default    | Used for                                                                                                                                                    | Code that reads it                                                 |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `[shipping] fee_rupees`        | `99`       | Flat shipping fee at checkout                                                                                                                               | `lib/shipping-config.ts`                                           |
| `[shipping] free_above_rupees` | `999`      | Free shipping at or above this subtotal; also the `{free_above}` in the announcement bar                                                                    | `lib/shipping-config.ts`, `components/layout/announcement-bar.tsx` |
| `[returns] window_days`        | `7` (0–60) | Days after delivery a customer may ask for a return. `0` turns returns off. Shown on product pages, refund policy, return page and the "delivered" message. | `services/return.service.ts`, `lib/returns.ts`                     |

#### `config/pricing.ini` — gold-rate safety limits

Today's rates themselves are **not** here: the shop team enters them in **Admin → Gold rates** (no deploy).

| Section / key                    | Default      | Used for                                                                                            | Code that reads it                       |
| -------------------------------- | ------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `[pricing] large_change_percent` | `15` (1–100) | A rate that moves more than this % must be confirmed with a tick box (catches "per 10 g" typos)     | `services/metal-rate.service.ts`         |
| `[pricing] stale_after_hours`    | `36`         | Admin dashboard warns when a rate used by rate-linked products is older than this                   | `services/metal-rate.service.ts`         |
| `[pricing] strip_purities`       | `K22,K24`    | Rates shown in the bar above the header, in order. Any of `K24, K22, K18, K14, S925, PT950`; max 4. | `components/layout/announcement-bar.tsx` |

#### `config/storefront.ini` — what shoppers see

Showroom address, hours, phone and WhatsApp are **not** here: they are in **Admin → Settings**.

| Section / key                 | Default                                                                          | Used for                                                                                                                                                       | Code that reads it                           |
| ----------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `[storefront] announcement`   | `Free insured shipping above ₹{free_above}. Every gold piece is BIS hallmarked.` | Text of the thin bar above the header (max 160 characters). Shown alone when there are no rates (or the rate strip is off); next to the rates on wide screens. | `components/layout/announcement-bar.tsx`     |
| `[storefront] featured_count` | `8` (0–24)                                                                       | Featured pieces on the home page                                                                                                                               | `app/page.tsx`                               |
| `[storefront] home_reviews`   | `3` (0–12)                                                                       | Recent 4–5 star published reviews on the home page; `0` hides the section                                                                                      | `app/page.tsx`, `services/review.service.ts` |

#### `config/inventory.ini` — stock holds and alerts

| Section / key                     | Default            | Used for                                                                        | Code that reads it                                                                                             |
| --------------------------------- | ------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `[inventory] reservation_minutes` | `15` (5–120)       | How long stock is held while a customer pays                                    | `services/inventory.service.ts`                                                                                |
| `[inventory] low_stock_threshold` | `3`                | "Low stock" on the dashboard, the products filter and the daily low-stock email | `services/admin/dashboard.service.ts`, `services/admin/product-admin.service.ts`, `services/report.service.ts` |
| `[alerts] admin_email`            | empty = all admins | Who gets low-stock emails and showroom-visit alerts                             | `services/alert.service.ts`, `services/visit.service.ts`                                                       |

#### `config/images.ini` — where product photos are stored (set once)

| Section / key            | Default      | Used for                                                                                                                                                              | Code that reads it                                             |
| ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `[images] provider`      | `cloudinary` | `cloudinary` (needs `CLOUDINARY_*` in `.env`), `r2` (Cloudflare R2, needs `R2_*` in `.env` + `r2_public_url`), or `none` (no uploads; admins pick placeholder images) | `services/upload.service.ts`                                   |
| `[images] max_upload_mb` | `5` (1–20)   | Largest photo an admin or customer can upload. Also sets the server-action body limit (`max_upload_mb + 1` MB) in `next.config.ts`.                                   | `services/upload.service.ts`, `next.config.ts`                 |
| `[images] r2_public_url` | empty        | Public `https://` address of the R2 bucket (custom domain or `r2.dev`). Also allowed in `next/image` and in saved image/video links.                                  | `services/upload.service.ts`, `lib/media.ts`, `next.config.ts` |

Setup steps for R2: [`INTEGRATIONS.md`](INTEGRATIONS.md#cloudflare-r2-product-photos--alternative-to-cloudinary).

#### `config/features.ini` — switches and log level

| Section / key                | Default | Turns on/off                                                                                                                 | Code that reads it                                             |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `[features] sms`             | `false` | Order SMS through MSG91 (also needs `MSG91_*` keys in `.env`)                                                                | `services/notification.service.ts`                             |
| `[features] visit_booking`   | `true`  | `/visit` page, "See it in the showroom" button, home page invite, footer link, dashboard visit count. Off → `/visit` is 404. | `app/visit/*`, `app/products/[slug]/page.tsx`, `app/page.tsx`  |
| `[features] whatsapp_button` | `true`  | "Ask on WhatsApp" on product, contact and visit pages (also needs a WhatsApp number in Admin → Settings)                     | `app/products/[slug]/page.tsx`, `app/(legal)/contact/page.tsx` |
| `[features] rate_strip`      | `true`  | Today's rates in the bar above the header (also needs rates in Admin → Gold rates)                                           | `components/layout/announcement-bar.tsx`                       |
| `[features] style_advisor`   | `true`  | `/style-advisor` quiz and its links. Off → 404.                                                                              | `app/style-advisor/page.tsx`                                   |
| `[logging] level`            | `info`  | `debug` / `info` / `warn` / `error` — see [`LOGGING.md`](LOGGING.md)                                                         | `lib/logger.ts`                                                |

**Admin → Settings** shows the current state of these switches, the image provider, the return window and the shipping fee (read-only), so the shop team can see them without opening the code.

### Overriding a value for one environment

Any key can be overridden with an env var named `SECTION_KEY` in capitals. Env wins over the file. The file a section lives in doesn't matter.

```
[shipping] fee_rupees      →  SHIPPING_FEE_RUPEES=0
[logging]  level           →  LOGGING_LEVEL=debug
[business] gstin           →  BUSINESS_GSTIN=36ABCDE1234F1Z5
[returns]  window_days     →  RETURNS_WINDOW_DAYS=0
[images]   provider        →  IMAGES_PROVIDER=none
[features] visit_booking   →  FEATURES_VISIT_BOOKING=false
```

Typical use: turn on `LOGGING_LEVEL=debug` on Vercel for an hour while chasing a bug, then remove it and redeploy — no code change, no commit.

Older env names from before the config files existed still work: `FREE_SHIPPING_ABOVE_RUPEES`, `FEATURE_SMS`, `ADMIN_ALERT_EMAIL`, `LOG_LEVEL`.

> **Upgrading an existing `.env` (made before 2026-10-25):** delete the lines `BUSINESS_*`, `GRIEVANCE_OFFICER_*`, `INVOICE_PREFIX`, `SHIPPING_FEE_RUPEES`, `FREE_SHIPPING_ABOVE_RUPEES`, `FEATURE_SMS`, `ADMIN_ALERT_EMAIL` from `.env` and from Vercel. If you leave them, they **override** `config/` (e.g. the old `[placeholder]` business name would win over your real one). The `app.start` log line lists every active override under `configOverriddenByEnv`.

> **Upgrading from the single `config.ini` (before 2026-11-18):** the file was split into `config/*.ini` with the same section and key names, so env overrides keep working. If you had edited `config.ini`, copy your values into the matching file (`[business]`, `[grievance_officer]`, `[invoice]` → `business.ini`; `[shipping]` → `shipping.ini`; `[inventory]`, `[alerts]` → `inventory.ini`; `[features]`, `[logging]` → `features.ini`) and delete `config.ini` — it is no longer read.

### Adding a new setting

1. Add the key with a comment to the `config/*.ini` file whose topic fits (a new section may go in any one file — but only one).
2. Add it to `configSchema` in `lib/config.ts` with a default and validation.
3. Read it with `import { config } from "@/lib/config"` — **server code only** (it reads files; it cannot run in the browser or in `middleware.ts`). Pass the value to client components as a prop.
4. Add a row to the right table above, a line to [`config/README.md`](../config/README.md) if it's a new file, and a test in `tests/config.test.ts` if it has rules.

### How config/ reaches Vercel

`next.config.ts` has `outputFileTracingIncludes: { "/**": ["./config/*.ini"] }`, which copies the files into every serverless function. `next.config.ts` also imports `lib/config.ts`, so the build fails if a file is invalid. If the `config/` folder is missing entirely, the schema defaults (plus env overrides) are used — fine for tests, never for production.

---

## Admin panel settings (database)

| Screen             | What                                                                      | Stored in                                                                 | Read by                          |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Admin → Gold rates | Selling rate per gram for 24K, 22K, 18K, 14K, 925 silver, PT950           | `MetalRate` table (newest row per purity = current; older rows = history) | `services/metal-rate.service.ts` |
| Admin → Settings   | Showroom address, opening hours, phone, WhatsApp number, Google Maps link | `AppSetting` row with key `storefront`                                    | `services/storefront.service.ts` |

Both are cached and refreshed the moment an admin saves. A hand-edited `AppSetting` row that fails validation is ignored (defaults are used, log `storefront.invalid_settings_row`). The contact page falls back to `[business] phone` when no showroom phone is set. Step-by-step for the shop team: [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md).

---

## .env (secrets)

Full commented list: `.env.example`. Validated by `lib/env.ts` the same way — a missing required value stops the app at startup.

| Variable                                                                                           | Required?                                            | Without it                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DIRECT_URL`                                                                       | Yes                                                  | App doesn't start                                                                                                     |
| `AUTH_SECRET`                                                                                      | Yes (32+ chars)                                      | App doesn't start                                                                                                     |
| `NEXT_PUBLIC_APP_URL`                                                                              | Yes; in production the live `https://` address       | Links in emails/sitemap point to localhost; production refuses to start                                               |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`                                | To take payments                                     | Checkout shows "payments not set up"                                                                                  |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                     | To send email                                        | Emails are only written to the log (`email.skipped_no_api_key`)                                                       |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                             | When `[images] provider = cloudinary`                | Admin picks from placeholder images                                                                                   |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`                           | When `[images] provider = r2` (plus `r2_public_url`) | Admin picks from placeholder images                                                                                   |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN` | For automatic shipping                               | Admin marks orders shipped by hand                                                                                    |
| `CRON_SECRET`                                                                                      | Yes in production                                    | Production refuses to start; locally cron endpoints return 503                                                        |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                                             | Optional                                             | "Continue with Google" is hidden                                                                                      |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`                                                             | Optional                                             | No error alerts (logs still work)                                                                                     |
| `NEXT_PUBLIC_GA_ID`                                                                                | Optional                                             | No Google Analytics                                                                                                   |
| `RUN_MIGRATIONS`                                                                                   | Optional, Vercel previews only                       | `1` = run `prisma migrate deploy` on a preview build (only for a preview with its **own** database). See `DEPLOY.md`. |

**Production safety check.** When `VERCEL_ENV=production`, `lib/env.ts` (`productionProblems()`) refuses to start unless `NEXT_PUBLIC_APP_URL` is an `https://` address that isn't localhost, `CRON_SECRET` is set, and the test-only overrides `RAZORPAY_API_BASE`, `CLOUDINARY_API_BASE`, `SHIPROCKET_API_BASE` are unset (or at their real values). The error starts with `❌ Unsafe production settings:`.

Keep `CLOUDINARY_CLOUD_NAME` set as long as any saved product, review or return photo still points at Cloudinary — even after switching to R2. Saved links are only accepted from **our** Cloudinary cloud (`res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/…`) or **our** R2 address (`r2_public_url`), see `lib/media.ts`.

**Quick check of what is switched on:** every server start logs one line `app.start` with `integrations: { razorpay: true, email: false, … }` (yes/no only, never the values). See `LOGGING.md`.
