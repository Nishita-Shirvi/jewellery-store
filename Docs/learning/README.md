# Learning path — understand this project end to end

Goal: after this path you can take any bug report ("customer paid but order shows unpaid", "GST is wrong on the invoice", "admin can't upload a photo") and within minutes know **which files** are involved, **what data** to check and **how to verify** a fix.

You don't need to read every file. The code is organised so that once you know the _layers_ and the _six critical flows_, everything else is lookup.

## The files in this folder

| #   | File                                                 | What you get from it                                                                                |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 01  | [01-codebase-map.md](01-codebase-map.md)             | How a request travels through the code; where each kind of code lives                               |
| 02  | [02-feature-map.md](02-feature-map.md)               | **Feature → files** lookup table. Your main tool when a bug comes in                                |
| 03  | [03-critical-flows.md](03-critical-flows.md)         | Step-by-step: checkout & payment, webhooks, stock holds, cancel/refund, returns, shipping, invoices |
| 04  | [04-data-model.md](04-data-model.md)                 | The tables, how they connect, statuses, money/weight rules                                          |
| 05  | [05-debugging-playbook.md](05-debugging-playbook.md) | Symptom → likely cause → where to look → how to fix                                                 |
| 06  | [06-practice-exercises.md](06-practice-exercises.md) | Hands-on tasks that prove you understand each area                                                  |

Reference docs one level up: `../ARCHITECTURE.md`, `../CONFIGURATION.md`, `../LOGGING.md`, `../DEPLOY.md`.

## Suggested plan (about 5 short sessions)

| Session               | Do this                                                                                                                                                                                                                                  | You're done when you can…                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **1. Run it**         | Follow the root `README.md` setup. Run `npm run dev`, `npm run db:seed`, log in as the seed admin. Click through: home → product → cart → checkout; then `/admin`. Read the `app.start` line in the terminal. Read `../ARCHITECTURE.md`. | …run the app and explain what each top-level folder is for.                             |
| **2. Layers**         | Read `01-codebase-map.md`. Then trace ONE simple feature end to end: the wishlist heart (`components/wishlist/wishlist-button.tsx` → `app/account/wishlist/actions.ts` → `services/wishlist.service.ts` → `WishlistItem` table).         | …say, for any file, which layer it belongs to and what it's allowed to do.              |
| **3. Money paths**    | Read `03-critical-flows.md` sections 1–3 with the code open (`services/order.service.ts`, `services/inventory.service.ts`, `app/api/webhooks/razorpay/route.ts`). Do a test payment with Razorpay test keys and watch the logs.          | …draw the checkout flow from memory, including what happens if the webhook comes first. |
| **4. After the sale** | Read `03-critical-flows.md` sections 4–7 and `04-data-model.md`. In Prisma Studio (`npm run db:studio`) follow one order through `Order`, `OrderItem`, `Payment`, `Invoice`, `Refund`.                                                   | …explain every `OrderStatus` and which code moves an order between them.                |
| **5. Debug & verify** | Read `05-debugging-playbook.md` and `../LOGGING.md`. Do 3 exercises from `06-practice-exercises.md`. Run `npm run verify` and the DB/E2E tests.                                                                                          | …take a made-up bug, find the file in under 5 minutes, and prove the fix with a test.   |

## The 10 files that matter most

If you only ever read ten files, read these — together they hold almost all the risky logic:

1. `prisma/schema.prisma` — every table and status
2. `lib/order-status.ts` — the order state machine
3. `services/order.service.ts` — checkout start, mark paid, mark failed
4. `services/inventory.service.ts` — stock holds (no overselling)
5. `app/api/webhooks/razorpay/route.ts` — Razorpay server-to-server events
6. `services/refund.service.ts` + `services/return.service.ts` — money going back
7. `services/pricing.ts` + `lib/gst.ts` + `lib/coupons.ts` — how totals and tax are computed
8. `services/shipment.service.ts` — Shiprocket + tracking
9. `lib/auth-guards.ts` + `middleware.ts` + `auth.ts` — who may do what
10. `lib/config.ts` + `lib/env.ts` + `lib/logger.ts` — settings and logs

## Habits that make bugs easy

- **Start from the symptom's page URL.** The URL maps to `app/<url>/page.tsx`; from there follow imports into `services/`.
- **Search for the log `event` name** you see in Vercel logs — it points to the exact line.
- **Never fix in the page if the rule lives in a service.** Fix it once, in the service, and every caller is fixed.
- **Every fix gets a test** in `tests/` (look for the file named after the area). `npm run verify` before every push.
- **Schema change = migration.** `npm run db:migrate -- --name what_changed`, commit the new folder in `prisma/migrations/`. Production only applies committed migrations.
- **Keep `Docs/` current**: new setting → `CONFIGURATION.md`; new decision → `note.md`; feature done → `checklist.md`.
