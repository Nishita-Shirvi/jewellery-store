# 05 — Debugging playbook

First, always: **(1)** check the `app.start` log line (what's switched on), **(2)** find the log lines for the order/user/time, **(3)** look at the rows in Prisma Studio. See `../LOGGING.md`.

## App won't start / build fails

| Symptom                                                          | Cause                                     | Fix                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `❌ Invalid or missing environment variables`                    | `.env` / Vercel env missing or wrong      | Message names the variable. Compare with `.env.example`. On Vercel: set it, then **Redeploy**.           |
| `❌ Invalid settings in config.ini`                              | Typo in `config.ini` (or an env override) | Message names `[section] key`. See `../CONFIGURATION.md`.                                                |
| `The table "public.Review" does not exist` (or any table/column) | Migrations not applied to that DB         | `npm run db:deploy` (production) / `npm run db:migrate` (local). Check `prisma/migrations` is committed. |
| `Can't reach database server` / health returns 503               | DB down, wrong URL, Neon paused           | Check `DATABASE_URL`; Neon free tier wakes up on first request — retry.                                  |
| Prisma "Unknown field" type errors after pulling                 | Prisma client out of date                 | `npm install` (runs `prisma generate`) or `npm run db:generate`.                                         |

## Payments

| Symptom                                    | Where to look                                                                       | Likely cause                                                                                                                                                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Online payments are not set up yet"       | `app.start` → `razorpay: false`                                                     | One of the three `RAZORPAY_*` vars missing.                                                                                                                                                                          |
| Customer paid, order still PENDING/FAILED  | Logs: `payment.` + order id; `Payment` row; Razorpay dashboard → webhook deliveries | Webhook URL/secret wrong in Razorpay (look for `webhook.razorpay_bad_signature`) **and** the popup callback didn't complete. Fix the webhook, then use Razorpay's "resend" on that event — processing is idempotent. |
| `payment.amount_mismatch`                  | `Payment.amountInPaise` vs `Order.totalInPaise`                                     | Order total changed after the Razorpay order was created — investigate before touching data.                                                                                                                         |
| `payment.sold_out_after_payment_refunding` | Order cancelled + Refund row                                                        | Expected: customer paid after their hold expired and the piece was sold. Refund goes out automatically.                                                                                                              |
| Paid twice for one cart                    | `Order.checkoutKey`, logs `payment.duplicate_payment_id`                            | Should be blocked; if it happened, refund one in Razorpay and file a bug with both payment ids.                                                                                                                      |
| Refund stuck "in progress"                 | `Refund.status`, logs `refund.`                                                     | Razorpay failed (`refund.failed_to_send`) → admin order page → **Retry refund**. Or the `refund.processed` webhook isn't subscribed in Razorpay.                                                                     |

## Stock

| Symptom                                      | Where to look                                                    | Likely cause / fix                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product shows "out of stock" but stock > 0   | `Product.reservedStock`; orders with `reservationState = ACTIVE` | Holds not released: `CRON_SECRET` not set or cron not running (`cron.unauthorized`, 503). Holds are also released at every checkout start. Call `/api/cron/release-reservations` with the bearer token. |
| Stock went negative / oversold               | `tests/db/reservation.test.ts`                                   | Should be impossible; someone changed stock outside `inventory.service.ts`.                                                                                                                             |
| Admin changed stock but shop shows old value | Cache (`CATALOG_TAG`)                                            | Changes made via admin revalidate instantly; changes made directly in DB show after ≤5 min.                                                                                                             |

## Emails, SMS, images, shipping, login

| Symptom                   | Check                                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No emails arrive          | `app.start` → `email: false` → set `RESEND_API_KEY`. Log `email.skipped_no_api_key` means it was only logged. Resend test domain only delivers to the account owner's address — verify your domain (`DEPLOY.md`). |
| No SMS                    | Needs `[features] sms = true` **and** `MSG91_*` keys **and** a DLT template.                                                                                                                                      |
| Admin can't upload photos | `app.start` → `imageUploads: false` → `CLOUDINARY_*`. Max 5 MB, JPG/PNG/WebP.                                                                                                                                     |
| "Create shipment" fails   | `Shipment.lastError` on the order; logs `shipment.`. Pickup location name must match Shiprocket exactly (`SHIPROCKET_PICKUP_LOCATION`). Press again — it resumes.                                                 |
| Tracking never updates    | Shiprocket webhook URL + token; logs `webhook.courier_bad_token`.                                                                                                                                                 |
| "Too many login attempts" | In-memory limit: 5 per email+IP / 15 min. Wait, or restart (dev).                                                                                                                                                 |
| Google button missing     | `AUTH_GOOGLE_ID/SECRET` not set — expected.                                                                                                                                                                       |
| Admin gets "forbidden"    | `User.role` must be ADMIN in the DB **and** the user must log out/in to refresh the cookie.                                                                                                                       |

## Money / tax looks wrong

| Symptom                                | Check                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong shipping fee                     | `config.ini [shipping]` (or `SHIPPING_FEE_RUPEES` override). Free threshold uses the subtotal **before** coupon. Logic: `lib/shipping-fee.ts`. |
| IGST instead of CGST+SGST (or reverse) | `config.ini [business] state` vs the customer's address state — must be the exact official name. `lib/gst.ts` → `isIntraState`.                |
| Coupon rejected                        | Message tells which rule; rules in `lib/coupons.ts`, limits in `services/coupon.service.ts`.                                                   |
| Old invoice shows old business name    | By design: invoices are frozen at payment time.                                                                                                |

## When you can't find it

1. Get the exact URL → open `app/<url>/page.tsx` → follow imports into `services/`.
2. Search the repo for the user-visible error text — every message is a string in the code.
3. Search for the log event name.
4. Use `02-feature-map.md`.
5. Reproduce in a test (copy the closest existing test in `tests/`), then fix, then `npm run verify`.
