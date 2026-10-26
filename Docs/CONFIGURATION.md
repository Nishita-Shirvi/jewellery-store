# Configuration

The app has exactly **two** places for settings. Knowing which one a value belongs in prevents most "it works locally but not live" problems.

| Where                                   | What goes there                                                                                                      | Committed to git? | Changes take effect                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| `config.ini` (project root)             | Business rules and store details: legal name, GSTIN, state, shipping fee, invoice prefix, stock hold time, log level | **Yes**           | On the next deploy (or `npm run dev` restart)                               |
| `.env` locally / Vercel → Env Variables | **Secrets** and per-environment URLs: database, Auth secret, Razorpay/Resend/Cloudinary/Shiprocket keys              | **Never**         | Locally on restart; on Vercel after a **redeploy** (Deployments → Redeploy) |

Rule of thumb: _if it would be bad for a stranger to read it, it's `.env`. Otherwise it's `config.ini`._

---

## config.ini

Loaded by `lib/config.ts`, validated with Zod. A typo (e.g. `state = Telengana`, `prefix = inv/`) stops `npm run dev` / `npm run build` with a message like:

```
❌ Invalid settings in config.ini (or its env overrides):
  - [business] state: Invalid option: expected one of "Andhra Pradesh"|...
```

so a bad value can never reach customers.

| Section / key                                         | Default            | Used for                                                      | Code that reads it                                                    |
| ----------------------------------------------------- | ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `[business] legal_name, address, email, phone, gstin` | `[placeholders]`   | Legal pages, invoices, footer, emails                         | `lib/business.ts` → `getBusiness()`                                   |
| `[business] state`                                    | `Telangana`        | GST: buyer in same state → CGST+SGST, else IGST               | `services/order.service.ts` (checkout), `services/invoice.service.ts` |
| `[grievance_officer] name, email`                     | `[placeholders]`   | Legal pages (required by e-commerce rules)                    | `lib/business.ts`                                                     |
| `[invoice] prefix`                                    | `INV`              | `INV/2026-27/000001`                                          | `services/invoice.service.ts`                                         |
| `[shipping] fee_rupees`, `free_above_rupees`          | `99`, `999`        | Shipping fee at checkout                                      | `lib/shipping-config.ts`                                              |
| `[inventory] reservation_minutes`                     | `15`               | How long stock is held while a customer pays                  | `services/inventory.service.ts`                                       |
| `[inventory] low_stock_threshold`                     | `3`                | "Low stock" on the admin dashboard + daily low-stock email    | `services/admin/dashboard.service.ts`, `services/report.service.ts`   |
| `[alerts] admin_email`                                | empty = all admins | Who gets low-stock emails                                     | `services/alert.service.ts`                                           |
| `[features] sms`                                      | `false`            | Order SMS through MSG91 (also needs `MSG91_*` keys in `.env`) | `services/notification.service.ts`                                    |
| `[logging] level`                                     | `info`             | `debug` / `info` / `warn` / `error` — see `LOGGING.md`        | `lib/logger.ts`                                                       |

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

| Variable                                                                                           | Required?              | Without it                                                      |
| -------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`, `DIRECT_URL`                                                                       | Yes                    | App doesn't start                                               |
| `AUTH_SECRET`                                                                                      | Yes (32+ chars)        | App doesn't start                                               |
| `NEXT_PUBLIC_APP_URL`                                                                              | Yes in production      | Links in emails/sitemap point to localhost                      |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`                                | To take payments       | Checkout shows "payments not set up"                            |
| `RESEND_API_KEY`, `EMAIL_FROM`                                                                     | To send email          | Emails are only written to the log (`email.skipped_no_api_key`) |
| `CLOUDINARY_*`                                                                                     | To upload photos       | Admin picks from placeholder images                             |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_PINCODE`, `SHIPROCKET_WEBHOOK_TOKEN` | For automatic shipping | Admin marks orders shipped by hand                              |
| `CRON_SECRET`                                                                                      | In production          | Cron endpoints return 503 → expired stock holds aren't released |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                                             | Optional               | "Continue with Google" is hidden                                |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`                                                             | Optional               | No error alerts (logs still work)                               |
| `NEXT_PUBLIC_GA_ID`                                                                                | Optional               | No Google Analytics                                             |

**Quick check of what is switched on:** every server start logs one line `app.start` with `integrations: { razorpay: true, email: false, … }` (yes/no only, never the values). See `LOGGING.md`.
