# Architecture

An online jewellery store for India. One Next.js app serves the shop, the customer account, the admin panel and all APIs/webhooks. One PostgreSQL database holds everything.

## Stack

| Concern       | Choice                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework     | Next.js 15 App Router, React 19, TypeScript (strict)                                                                                       |
| UI            | Tailwind CSS 4 + a few shadcn/ui components (`components/ui`)                                                                              |
| Database      | PostgreSQL (Neon in production) through Prisma 6                                                                                           |
| Auth          | Auth.js v5 — email/password (bcrypt) + optional Google, JWT sessions                                                                       |
| Payments      | Razorpay (popup checkout + webhooks)                                                                                                       |
| Shipping      | Shiprocket (optional; manual shipping without it)                                                                                          |
| Email / SMS   | Resend + React Email; MSG91 SMS behind a flag                                                                                              |
| Images        | Cloudinary **or** Cloudflare R2 (`[images] provider`; placeholder images without either). R2 is signed with our own SigV4 code, no AWS SDK |
| Invoices      | `@react-pdf/renderer`, rendered on demand from frozen DB data                                                                              |
| Errors / logs | `lib/logger.ts` JSON logs + Sentry (optional)                                                                                              |
| Hosting       | Vercel (app + cron) + Neon (database)                                                                                                      |
| Tests         | Vitest (unit + real-DB tests), Playwright (end-to-end)                                                                                     |

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

| Folder / file                                | Contents                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/`                                       | Routes. `(auth)` login/register, `(legal)` policy pages, `account/`, `admin/` (incl. `rates/`, `settings/`, `visits/`), `cart/`, `checkout/`, `orders/`, `products/`, `collections/`, `size-guide/`, `style-advisor/`, `visit/`, `api/`                                                                                  |
| `components/`                                | UI grouped by feature (`catalog`, `cart`, `checkout`, `admin`, `reviews`, `storefront`, `layout` incl. the rate/announcement bar, …) + `ui/` primitives                                                                                                                                                                  |
| `services/`                                  | Business logic, one file per area; `services/admin/` for admin-only queries. New: `metal-rate.service.ts` (rates + repricing), `storefront.service.ts` (showroom settings), `visit.service.ts` (visit requests)                                                                                                          |
| `lib/`                                       | Helpers, config, env, logger, validation schemas (`lib/validation/`), external API clients. New: `metal-pricing.ts` (rate-linked price maths), `storefront.ts` (occasions, sizes, budgets, WhatsApp links — safe in the browser), `media.ts` (which image/video URLs we accept), `storage/sigv4.ts` (R2 request signing) |
| `emails/`                                    | React Email template for order emails                                                                                                                                                                                                                                                                                    |
| `prisma/`                                    | `schema.prisma`, `migrations/` (applied in production), `seed.ts` + `seed-data/`                                                                                                                                                                                                                                         |
| `tests/`                                     | Unit tests (`*.test.ts`), real-DB tests (`tests/db/`), Playwright (`tests/e2e/`)                                                                                                                                                                                                                                         |
| `types/`                                     | Shared TypeScript types, Auth.js session typing                                                                                                                                                                                                                                                                          |
| `scripts/`                                   | `check-client-bundle.mjs` — fails the build if a secret leaks into browser JS; `vercel-build.mjs` — Vercel build (generate → migrate on production only → build)                                                                                                                                                         |
| `config/`                                    | Non-secret settings, one `*.ini` file per topic (business, shipping, pricing, storefront, inventory, images, features) — see `CONFIGURATION.md`                                                                                                                                                                          |
| `auth.ts`, `auth.config.ts`, `middleware.ts` | Login setup (full / Edge-safe) and route protection                                                                                                                                                                                                                                                                      |
| `instrumentation*.ts`                        | Server start-up (startup log + Sentry) and browser Sentry                                                                                                                                                                                                                                                                |
| `next.config.ts`                             | Security headers, image domains (our Cloudinary cloud + R2 public host), upload body limit from `[images] max_upload_mb`, config/env validation at build, Sentry                                                                                                                                                         |
| `vercel.json`                                | Cron schedule                                                                                                                                                                                                                                                                                                            |
| `.github/workflows/`                         | `ci.yml` (full test pipeline + "migrations match schema.prisma"), `cron.yml` (optional 10-minute stock-hold release for the free Vercel plan)                                                                                                                                                                            |

## Where settings live

| Kind                                                                         | Where                                                              | Read by                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Secrets, per-environment URLs                                                | `.env` / Vercel env                                                | `lib/env.ts` (validated; extra production checks)                                                |
| Business rules, store details, switches (change by deploy)                   | `config/*.ini`                                                     | `lib/config.ts` (merged, validated, env overrides)                                               |
| Day-to-day shop data: metal rates, showroom address/hours/phone/WhatsApp/map | Database (`MetalRate`, `AppSetting "storefront"`), edited in Admin | `services/metal-rate.service.ts`, `services/storefront.service.ts` (cached, revalidated on save) |

## Background work (no queue — kept minimal on purpose)

| Endpoint                         | Trigger                                                                                                      | Does                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `/api/cron/release-reservations` | Vercel cron daily + GitHub `cron.yml` every 10 min (if enabled); holds also released at every checkout start | Cancels unpaid orders past their hold, returns stock; sends refunds stuck unsent for 10+ min |
| `/api/cron/low-stock`            | Vercel cron daily 09:00 IST                                                                                  | Emails admins the low-stock list (once per day)                                              |
| `/api/webhooks/razorpay`         | Razorpay                                                                                                     | `payment.captured/failed`, `refund.processed/failed`                                         |
| `/api/webhooks/courier-updates`  | Shiprocket                                                                                                   | Tracking updates → SHIPPED / DELIVERED                                                       |

Cron endpoints require `Authorization: Bearer <CRON_SECRET>`. Webhooks verify a signature/token before doing anything and are idempotent (safe to receive twice).

## Safety properties worth knowing

- **Money is integer paise**, weights are integer milligrams — never floats (`lib/money.ts`).
- **Prices are never trusted from the browser**; the cart and checkout re-read prices and stock from the DB (`services/pricing.ts`, `services/cart.service.ts`).
- **Rate-linked prices are stored, not calculated per request**: saving rates reprices products in the same transaction (`services/metal-rate.service.ts`), so every reader sees one price and checkout's "price changed" check still works.
- **Stock can't be oversold**: one conditional SQL update per line (`services/inventory.service.ts`), tested under real concurrency (`tests/db/reservation.test.ts`).
- **Order status changes** must be allowed by `lib/order-status.ts` (`ORDER_TRANSITIONS`).
- **Payments are idempotent**: callback and webhook may both arrive; only the first changes anything (`markOrderPaid` in `services/order.service.ts`). A captured payment that can't pay for its order (sold out, already paid, cancelled) is always refunded in full.
- **Refunds are DB-first and claimed**: the `Refund` row is created inside the business transaction; `issueRefund` claims it before calling Razorpay and checks Razorpay for an existing refund first, so retries, cron and webhooks never refund twice (`services/refund.service.ts`).
- **Only our own media**: saved photo/video links must come from our Cloudinary cloud or R2 bucket (`lib/media.ts`); uploads are checked by their real bytes.
- **Safe redirects**: post-login "return to" paths go through `lib/safe-redirect.ts` (same-origin only).
- **Admin access is checked twice**: cookie in middleware, then role in the DB on every admin action (`lib/auth-guards.ts`, tested by `tests/admin-actions-guard.test.ts`).

## Deliberately NOT included (add when needed)

No Docker, no job queue/Redis, no separate backend service, no microservices. Rate limiting is in-memory per server instance (`lib/rate-limit.ts`). The roadmap for these is in `Goal.md` (Phases 17–30); add them only when traffic or a real need asks for it.
