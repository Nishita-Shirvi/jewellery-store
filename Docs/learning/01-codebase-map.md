# 01 — Codebase map: how a request travels

## Four kinds of entry points

Every behaviour in the app starts at one of these. Find the entry point, then follow its imports.

| Entry point       | Lives in                  | Triggered by                      | Example                                                 |
| ----------------- | ------------------------- | --------------------------------- | ------------------------------------------------------- |
| **Page**          | `app/<url>/page.tsx`      | Visiting a URL                    | `/products/gold-ring` → `app/products/[slug]/page.tsx`  |
| **Server Action** | `app/<area>/actions.ts`   | A form submit / button in the UI  | "Add to cart" → `app/cart/actions.ts`                   |
| **API route**     | `app/api/<path>/route.ts` | HTTP call from outside or from JS | Razorpay webhook → `app/api/webhooks/razorpay/route.ts` |
| **Server start**  | `instrumentation.ts`      | App boot                          | Startup log, Sentry init                                |

URL folders in brackets are parameters (`[slug]`, `[id]`). Folders in parentheses are groups that **don't** appear in the URL: `app/(auth)/login` is `/login`, `app/(legal)/privacy` is `/privacy`. `app/products/(list)/page.tsx` is `/products`.

## Life of a request (example: customer clicks "Add to cart")

```
components/cart/add-to-cart.tsx         ("use client" button, runs in the browser)
   │  calls the server action
   ▼
app/cart/actions.ts → addToCartAction()  (runs on the server)
   │  1. validate input with lib/validation/cart.ts (Zod)
   │  2. figure out who the user is (guest cookie or logged in)
   ▼
services/cart.service.ts → addItem()
   │  re-reads price + stock from DB, enforces MAX_QTY_PER_ITEM and available stock
   ▼
Prisma (lib/db.ts) → Cart / CartItem tables
   │
   ▼
action returns → revalidatePath() → UI shows the updated cart badge
```

Every feature follows the same shape. Learn it once, reuse it everywhere.

## Who checks what (security)

| Layer                  | Checks                                                                                                                                | File                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `middleware.ts` (Edge) | Is there a valid session cookie for `/account`, `/checkout`, `/orders`, `/admin`? Admin role in the cookie for `/admin`. Fast, no DB. | `middleware.ts`, `auth.config.ts` |
| Page / action / route  | `requireUser()` / `requireAdmin()` — admin role re-read **from the DB**                                                               | `lib/auth-guards.ts`              |
| Service                | Ownership: a customer only gets **their own** order/address (`where: { id, userId }`)                                                 | `services/*.service.ts`           |
| Input                  | Zod schemas, never trust the browser                                                                                                  | `lib/validation/*.ts`             |

## Where shared stuff lives

| Need                                      | Use                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Database client                           | `import { db } from "@/lib/db"`                                                                  |
| Secret / URL                              | `import { env } from "@/lib/env"`                                                                |
| Business setting                          | `import { config } from "@/lib/config"` (reads `config/*.ini`, server only)                      |
| Store/legal details                       | `getBusiness()` from `lib/business.ts`                                                           |
| Showroom details (admin-editable)         | `getStorefrontSettings()` from `services/storefront.service.ts`                                  |
| Today's metal rates                       | `getCurrentRates()` from `services/metal-rate.service.ts`; price maths in `lib/metal-pricing.ts` |
| Occasions, sizes, budgets, WhatsApp links | `lib/storefront.ts` (safe in client components)                                                  |
| Is this image/video link ours?            | `isAllowedImageUrl()` / `isAllowedVideoUrl()` from `lib/media.ts`                                |
| Upload a photo                            | `uploadImage()` from `services/upload.service.ts` (Cloudinary or R2, per `[images] provider`)    |
| Safe "return to" path after login         | `safeRedirectPath()` from `lib/safe-redirect.ts`                                                 |
| Logging                                   | `import { logger } from "@/lib/logger"`                                                          |
| Money formatting / maths                  | `lib/money.ts`, `lib/format.ts` (`formatINR`)                                                    |
| Order status rules / labels               | `lib/order-status.ts`                                                                            |
| Rate limiting                             | `rateLimit(key, limit, windowMs)` from `lib/rate-limit.ts`                                       |
| Razorpay / Shiprocket HTTP                | `lib/payments/razorpay.ts`, `lib/shipping/shiprocket.ts`                                         |

## Caching (why a change sometimes "doesn't show")

- Catalog reads (`services/catalog.service.ts`) use `unstable_cache` with tag `CATALOG_TAG`, 5-minute lifetime. Admin product edits and stock changes call `revalidateTag`/`revalidatePath` so the shop updates right away.
- Metal rates (`RATES_TAG`, 10 minutes) and showroom settings (`STOREFRONT_TAG`, 1 hour) are cached the same way and refreshed the moment an admin saves them. Saving rates that change any price also refreshes `CATALOG_TAG`.
- If you change product data, rates or settings **directly in the database** (Prisma Studio), the shop may show old data until the cache lifetime ends.
- `sitemap.xml` is regenerated hourly.

## Tests map

| Command            | Runs                                                                                                                                           | Needs                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `npm test`         | `tests/*.test.ts` — pure logic, mocked DB                                                                                                      | nothing                          |
| `npm run test:db`  | `tests/db/*.test.ts` — concurrency, invoices (+ placeholder guard), coupons, search, payment/refund races, rates/visits/sizes on real Postgres | `DATABASE_URL` (a throwaway DB!) |
| `npm run test:e2e` | `tests/e2e/` — browser: browse → cart → checkout → pay (fake Razorpay in `tests/e2e/mock-services.mjs`)                                        | a built app + DB                 |
| `npm run verify`   | lint + typecheck + unit tests                                                                                                                  | nothing                          |

CI (`.github/workflows/ci.yml`) runs all of them on every push to `main`, plus a check that `prisma/migrations` matches `schema.prisma` (`prisma migrate diff --exit-code`).
