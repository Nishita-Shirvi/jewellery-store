# Architecture

An online jewellery store for India. One Next.js app serves the shop, the customer account, the admin panel and all APIs/webhooks. One PostgreSQL database holds everything.

## Stack

- **Framework** — Next.js 15 App Router, React 19, TypeScript (strict)
- **UI** — Tailwind CSS 4 + a few shadcn/ui components (`components/ui`)
- **Database** — PostgreSQL (Neon in production) through Prisma 6
- **Auth** — Auth.js v5 — email/password (bcrypt) + optional Google, JWT sessions
- **Payments** — Razorpay (popup checkout + webhooks)
- **Shipping** — Shiprocket (optional; manual shipping without it)
- **Email / SMS** — Resend + React Email; MSG91 SMS behind a flag
- **Images** — Cloudinary **or** Cloudflare R2 (`[images] provider`; placeholder images without either). R2 requests are signed with our own SigV4 code (`lib/storage/sigv4.ts`), no AWS SDK
- **Invoices** — `@react-pdf/renderer`, rendered on demand from frozen DB data
- **Errors / logs** — `lib/logger.ts` JSON logs + Sentry (optional)
- **Hosting** — Vercel (app + cron) + Neon (database)
- **Tests** — Vitest (unit + real-DB tests), Playwright (end-to-end)

## Layers — the one rule that keeps the code findable

```
Browser
  │
  ├─ middleware.ts ............ Edge: is there a login cookie? (no DB) → redirect to /login
  │
  ├─ app/**/page.tsx .......... Server Components: read data via services, render HTML
  ├─ app/**/actions.ts ........ Server Actions: form/button handlers ("use server")
  ├─ app/api/**/route.ts ...... HTTP endpoints: webhooks, cron, invoice PDF, health
  │        │
  │        │  validate input (lib/validation/*, Zod) + check user (lib/auth-guards.ts)
  │        ▼
  ├─ services/*.service.ts .... ALL business logic + DB access (Prisma). Server-only.
  │        │
  │        ▼
  ├─ lib/* .................... Pure helpers (money, GST, state machine, config, logger)
  │                             and API clients (lib/payments/razorpay.ts, lib/shipping/shiprocket.ts)
  ▼
PostgreSQL (prisma/schema.prisma)
```

- Pages, actions and routes stay **thin**: validate → check permission → call a service → return.
- **Services** own the rules (pricing, stock, payments, refunds). If a bug is about "wrong behaviour", it is almost always in `services/`.
- **lib/** has small pure functions that are easy to unit test (`lib/money.ts`, `lib/gst.ts`, `lib/coupons.ts`, `lib/order-status.ts`).
- `components/` is UI only. Client components (`"use client"`) never import `lib/env`, `lib/config` or services.

## Folder map

- **`app/`** — Routes. `(auth)` login/register, `(legal)` policy pages, `account/`, `admin/` (incl. `rates/`, `settings/` = Showroom, `visits/`), `cart/`, `checkout/`, `orders/`, `products/`, `collections/`, `size-guide/`, `style-advisor/`, `visit/`, `api/`
- **`components/`** — UI grouped by feature (`catalog`, `cart`, `checkout`, `admin`, `reviews`, `storefront`, `layout` incl. the rate strip, …) + `ui/` primitives
- **`services/`** — Business logic, one file per area; `services/admin/` for admin-only queries. Storefront release: `metal-rate.service.ts` (rates + repricing), `storefront.service.ts` (showroom settings), `visit.service.ts` (visit requests)
- **`lib/`** — Helpers, config, env, logger, validation schemas (`lib/validation/`), external API clients. Storefront release: `metal-pricing.ts` (rate-linked price maths), `storefront.ts` (occasions, budgets, size tables, visit slots — safe in the browser), `media.ts` (which image/video links we accept), `storage/sigv4.ts` (R2 request signing)
- **`emails/`** — React Email template for order emails
- **`prisma/`** — `schema.prisma`, `migrations/` (applied in production), `seed.ts` + `seed-data/`
- **`tests/`** — Unit tests (`*.test.ts`), real-DB tests (`tests/db/`), Playwright (`tests/e2e/`)
- **`types/`** — Shared TypeScript types, Auth.js session typing
- **`scripts/`** — `check-client-bundle.mjs` (fails the build if a secret leaks into browser JS), `pii-encrypt.ts`, `restore-drill.ts`, `staff-reset-2fa.ts`, `vercel-build.mjs` (generate → migrate on production only → build)
- **`config/`** — Non-secret settings, one `*.ini` file per topic (see `CONFIGURATION.md`)
- **`auth.ts`, `auth.config.ts`, `middleware.ts`** — Login setup (full / Edge-safe) and route protection
- **`instrumentation*.ts`** — Server start-up (startup log + Sentry) and browser Sentry
- **`next.config.ts`** — Security headers (CSP incl. `media-src` for our Cloudinary and R2), image domains (our Cloudinary cloud + R2 public host), upload body limit from `[images] max_upload_mb`, config/env validation at build, Sentry
- **`vercel.json`** — Cron schedule
- **`.github/workflows/`** — `ci.yml` (full test pipeline + "Migrations match schema.prisma"), `cron.yml` (optional 10-minute stock-hold release for the free Vercel plan)

## Where settings live

- **Secrets, per-environment URLs** — `.env` / Vercel env, read by `lib/env.ts` (validated; extra production checks)
- **Business rules, store details, switches (change by deploy)** — `config/*.ini`, read by `lib/config.ts` (merged, validated, env overrides)
- **Day-to-day shop data: metal rates, showroom address/hours/phone/WhatsApp/map** — database (`MetalRate`, `AppSetting` "storefront"), edited in Admin, read by `services/metal-rate.service.ts` and `services/storefront.service.ts` (cached, refreshed on save)

## Background work (a Postgres job queue — no Redis)

Slow or retryable work (emails, SMS, invoices, alerts, webhooks to other systems, the daily recommendation rebuild and Razorpay settlement check) goes into the `Job` table (`services/jobs.service.ts`, handlers in `services/job-handlers.ts`). A job is queued **inside the same transaction** as the change it belongs to, retried with backoff, and shown on Admin → Jobs when it gives up. The cron endpoints below run due jobs.

- **`/api/cron/jobs`**
  - Trigger: GitHub `cron.yml` every 10 min (if enabled)
  - Does: Runs due background jobs + retries, releases expired holds, prunes old jobs; once a day queues the recommendations rebuild
- **`/api/cron/release-reservations`**
  - Trigger: Vercel cron daily; also run at every checkout start
  - Does: Same as `/api/cron/jobs` (kept for existing schedules)
- **`/api/cron/low-stock`**
  - Trigger: Vercel cron daily 09:00 IST
  - Does: Queues the low-stock email (once per day) and runs due jobs
- **`/api/webhooks/razorpay`**
  - Trigger: Razorpay
  - Does: `payment.captured/failed`, `refund.processed/failed`
- **`/api/webhooks/courier-updates`**
  - Trigger: Shiprocket
  - Does: Tracking updates → SHIPPED / DELIVERED

Cron endpoints require `Authorization: Bearer <CRON_SECRET>`. Webhooks verify a signature/token before doing anything and are idempotent (safe to receive twice).

## Safety properties worth knowing

- **Money is integer paise**, weights are integer milligrams — never floats (`lib/money.ts`).
- **Prices are never trusted from the browser**; the cart and checkout re-read prices and stock from the DB (`services/pricing.ts`, `services/cart.service.ts`).
- **Stock can't be oversold**: one conditional SQL update per line (`services/inventory.service.ts`), tested under real concurrency (`tests/db/reservation.test.ts`).
- **Rate-linked prices are stored, not worked out per request**: saving rates (or a rate-linked product, its options or variants) reprices every variant in one transaction (`services/metal-rate.service.ts`), so every reader sees one price and checkout's "price changed" check still works.
- **Order status changes** must be allowed by `lib/order-status.ts` (`ORDER_TRANSITIONS`).
- **Payments are idempotent**: callback and webhook may both arrive; only the first changes anything (`markOrderPaid` in `services/order.service.ts`).
- **Admin access is checked twice**: cookie in middleware, then the staff member's **permission** in the DB on every admin action (`lib/permissions.ts`, `lib/auth-guards.ts`; every action is listed in `tests/admin-actions-guard.test.ts`, which fails if a new one isn't).
- **Personal data is encrypted at rest**: addresses, phone numbers and invoice buyer details (`lib/pii.ts`, AES-GCM, key `PII_ENCRYPTION_KEY`).
- **Kill switches** (`services/switches.service.ts`): checkout, COD, coupons and recommendations can be paused from Admin → System, enforced on the server.
- **Works without outside accounts**: no courier API → manual tracking; no payment keys → "contact us to order"; no email/SMS keys → messages are logged and retried later.
- **Only our own media**: saved photo/video links must come from our Cloudinary cloud or R2 address (`lib/media.ts`); customer review/return photos must be our own upload in the right folder.
- **Safe redirects**: post-login "return to" paths go through `lib/safe-redirect.ts` (same site only).
- **Stock edits don't undo sales**: the product form and quick stock box send the stock they showed; a mismatch refuses the save.

- **Payments that can't be kept are refunded in one transaction** (`services/order.service.ts`): sold out at payment → order REFUND_PENDING + payment + refund row together; a second payment on a finished order is stored as its own Payment and refunded in full.
- **A refund is sent once** (`services/refund.service.ts`): claimed (`REFUND_SENDING`) before calling Razorpay; stuck sends are swept by the reservations job; `canRetryRefund` decides when the admin Retry button shows.
- **No cancel while a parcel exists**: cancel/refund is refused once a Shiprocket shipment or AWB exists (re-checked under the order lock).
- **Invoices wait for real business details**: no invoice number is used while config/business.ini still has `[placeholders]`.

- **Public API and webhooks** (`/api/v1`, `services/integrations.service.ts`): hashed API keys with rate limits; outgoing webhooks are HMAC-signed and never sent to private addresses.

## Deliberately NOT included (add when needed)

No Docker, no Redis, no separate backend service, no microservices. Rate limiting is in-memory per server instance (`lib/rate-limit.ts`). The roadmap for these is in `Goal.md` (Phases 17–30); add them only when traffic or a real need asks for it.
