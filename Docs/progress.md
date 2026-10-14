# Progress

**Rule:** before starting any phase, add a "Before Phase X" entry at the top of the log below, describing where the project stands. After finishing the phase, update its row in the status table.

**Last updated:** 2026-10-08
**Current phase:** Phase 16 — Analytics, reports, release (done; run `npx prisma migrate dev --name phase16_analytics` locally). Week 2 complete. Next: Week 3, Phase 17 — Product variants.

---

## Status overview

Status values: ⬜ Not started · 🟨 In progress · ✅ Done · ⛔ Blocked · ⏭️ Deferred

| Phase | Name                            | Status | Started    | Finished   | Notes                                                                                                            |
| ----- | ------------------------------- | ------ | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 0     | Planning and Docs folder        | ✅     | 2026-10-08 | 2026-10-08 | Docs created                                                                                                     |
| 1     | Project setup                   | ✅     | 2026-10-08 | 2026-10-08 | Health check verified against real PostgreSQL (200 when up, 503 when down)                                       |
| 2     | Database schema                 | ✅     | 2026-10-08 | 2026-10-09 | Migrated and seeded on Neon (Singapore) by the client                                                            |
| 3     | Authentication                  | ✅     | 2026-10-09 | 2026-10-09 | 24/24 browser checks in the sandbox; Google login waits for keys (B-06)                                          |
| 4     | Catalog                         | ✅     | 2026-10-09 | 2026-10-09 | 25/25 browser checks in the sandbox                                                                              |
| 5     | Cart                            | ✅     | 2026-10-09 | 2026-10-09 | 20/20 browser checks + unit tests                                                                                |
| 6     | Checkout and payments           | ✅     | 2026-10-09 | 2026-10-09 | 27/27 payment scenarios + race test; needs real test keys locally (B-01)                                         |
| 7     | Account and admin panel         | ✅     | 2026-10-09 | 2026-10-09 | 38/38 browser checks + admin-security unit tests                                                                 |
| 8     | Hardening and deployment        | ✅     | 2026-10-09 | 2026-10-09 | Code + CI done; going live waits on client accounts (DEPLOY.md)                                                  |
| 9     | Inventory reservation           | ✅     | 2026-10-09 | 2026-10-09 | 7 real-DB concurrency tests, 35/35 payment scenarios, full regression green                                      |
| 10    | Shipping (Shiprocket)           | ✅     | 2026-10-09 | 2026-10-09 | 21/21 shipping checks; full regression 163 browser + 86 unit + 7 DB tests                                        |
| 11    | Cancellations, returns, refunds | ✅     | 2026-10-10 | 2026-10-10 | 34/34 refund checks; full regression 218 browser + 3 Playwright + 105 unit + 7 DB                                |
| 12    | GST invoices and order emails   | ✅     | 2026-10-10 | 2026-10-10 | 20/20 invoice checks (PDF text verified) + 5 DB tests; full regression green                                     |
| 13    | Coupons and wishlist            | ✅     | 2026-10-10 | 2026-10-11 | 24/24 browser checks, coupon rules unit-tested, 2 DB concurrency tests; full regression green                    |
| 14    | Reviews and ratings             | ✅     | 2026-10-11 | 2026-10-11 | 20/20 browser checks + DB concurrency test (found and fixed a stale-average race)                                |
| 15    | Search, SEO, performance        | ✅     | 2026-10-11 | 2026-10-11 | 21/21 browser checks + 9 DB search tests; Lighthouse to be measured on the live site                             |
| 16    | Analytics, reports, release     | ✅     | 2026-10-11 | 2026-10-11 | 18/18 browser checks (reports match DB); see note D-114 for regression scope                                     |
| 17    | Product variants                | ⬜     |            |            |                                                                                                                  |
| 18    | COD and payment options         | ⬜     |            |            | Needs MSG91 + DLT                                                                                                |
| 19    | Background jobs                 | ⬜     |            |            |                                                                                                                  |
| 20    | Abandoned cart and marketing    | ⬜     |            |            |                                                                                                                  |
| 21    | Staff roles and permissions     | ⬜     |            |            |                                                                                                                  |
| 22    | Customer support                | ⬜     |            |            |                                                                                                                  |
| 23    | Security, PWA, release          | ⬜     |            |            |                                                                                                                  |
| 24    | Merchandising and CMS           | ⬜     |            |            |                                                                                                                  |
| 25    | Recommendations                 | ⬜     |            |            |                                                                                                                  |
| 26    | Monitoring and alerts           | ⬜     |            |            |                                                                                                                  |
| 27    | Privacy and compliance          | ⬜     |            |            | Needs legal/CA review                                                                                            |
| 28    | Accessibility, Hindi, UX polish | ⬜     |            |            | Best done after final design                                                                                     |
| 29    | Accounting and integrations     | ⬜     |            |            |                                                                                                                  |
| 30    | Disaster recovery, docs, launch | ⬜     |            |            |                                                                                                                  |
| F     | Final frontend design           | 🟨     | 2026-10-11 |            | Design system + header, footer, home, product card/page done; next: listing, cart, checkout, account, auth pages |

---

## Pre-phase log (newest first)

### Template — copy this before starting each phase

```
### Before Phase X — <name> (YYYY-MM-DD)
**Done so far:** what is finished and working
**Not finished / carried over:** anything left from earlier phases
**Open blockers:** IDs from blocker.md that affect this phase
**Plan for this phase:** main tasks, in order
**Risks:** anything that could go wrong
**Git:** last commit / tag before starting (e.g. phase-0)
```

---

### Before Phase 13 — Coupons and wishlist (2026-10-10)

**Done so far:** Phases 1–12 (store, payments, shipping, refunds, GST invoices).
**Not finished / carried over:** None.
**Open blockers:** None for this phase.
**Plan for this phase:** Coupon model (percent/flat, minimum order, cap, dates, total and per-customer limits), server-only pricing with exact per-line discount split for GST, redemptions counted inside the payment transaction, admin coupon pages, wishlist (save, list, move to cart).
**Risks:** Limit bypass under concurrency — row-locked counter, DB-tested.
**Git:** tag `phase-12` before starting. (Paused 2026-10-11 for the storefront redesign, resumed the same day.)

### Before Phase 12 — GST invoices and order emails (2026-10-10)

**Done so far:** Phases 1–11 including automatic refunds and returns.
**Not finished / carried over:** None.
**Open blockers:** B-04 (GSTIN, business state), B-09 (CA to confirm GST rates/HSN), B-08 (MSG91 DLT for SMS).
**Plan for this phase:** HSN + GST rate per product; tax split (CGST+SGST or IGST) frozen on each order line at checkout; gap-free invoice numbers per financial year; PDF tax invoice on payment; customer/admin download; React Email templates for confirmed/shipped/delivered/cancelled/refunded through one notification service; optional MSG91 SMS.
**Risks:** Duplicate or skipped invoice numbers; tax totals not matching the order — both tested.
**Git:** tag `phase-11` before starting.

### Before Phase 11 — Cancellations, returns, refunds (2026-10-10)

**Done so far:** Phases 1–10: store, Razorpay checkout, admin, deployment setup, stock holds, Shiprocket shipping.
**Not finished / carried over:** Client to deploy and connect Razorpay/Shiprocket accounts.
**Open blockers:** B-01 (Razorpay keys), B-05 (Shiprocket).
**Plan for this phase:** One order state machine; customer cancel before shipping with automatic refund; returns within 7 days (items, reason, photo); admin approve (restock option) / reject; partial refunds per item; Razorpay Refunds API with duplicate protection; refund.processed / refund.failed webhooks; emails at each step; sold-out-after-payment refunded automatically.
**Risks:** Double refunds (double clicks, retries, lost responses, repeated webhooks) — each covered by a test.
**Git:** tag `phase-10` before starting.

### Before Phase 10 — Shipping (2026-10-09)

**Done so far:** Phases 1–9: full store with Razorpay checkout, admin panel, deployment setup, 15-minute stock holds.
**Not finished / carried over:** Client still to deploy (DEPLOY.md) and try test payments.
**Open blockers:** B-05 (Shiprocket account + KYC, jewellery shipping/insurance rules).
**Plan for this phase:** Shiprocket client (login token shared via the database), Create Shipment (order → AWB → label → pickup, resumable), Shipment + timeline models, tracking webhook moving orders to SHIPPED/DELIVERED, customer tracking timeline, pincode check on product page and at checkout (cached), configurable shipping fee.
**Risks:** Duplicate parcels on retry; out-of-order or repeated webhooks — both covered by tests.
**Git:** tag `phase-9` before starting.

### Before Phase 8 — Hardening and deployment (2026-10-09)

**Done so far:** Phases 1–7: the full basic store (catalogue, cart, Razorpay checkout, customer account, admin panel).
**Not finished / carried over:** Client to try Razorpay test payment locally.
**Open blockers:** B-01 (Razorpay KYC for live keys), B-04 (business details for legal pages), B-07 (domain + email DNS), B-10 (GitHub, Vercel, Sentry accounts).
**Plan for this phase:** Security review (headers, server-action limits, secrets in browser code, rate limits); Sentry; error pages; legal pages; Playwright end-to-end test; GitHub Actions CI; Dependabot; deployment guide and go-live checklist.
**Risks:** Third-party scripts breaking the store; secrets leaking to the browser — both tested.
**Git:** tag `phase-7` before starting.

### Before Phase 7 — Account and admin panel (2026-10-09)

**Done so far:** Phases 1–6: setup, database, login, catalogue, cart, checkout with Razorpay (tested with a stand-in Razorpay).
**Not finished / carried over:** Client to add Razorpay test keys and try a test payment.
**Open blockers:** B-01 (Razorpay keys), B-10 (Cloudinary account for image uploads — placeholder picker until then).
**Plan for this phase:** Customer order history + detail + address book; admin dashboard (today's orders, revenue, low stock); products (list, search, create, edit, hide, stock, image upload); orders (filter, detail, allowed status changes only); categories (create, edit, delete when empty); confirmation dialogs; server-side admin checks on every action.
**Risks:** Customers calling admin actions directly — covered by middleware + requireAdmin in every action, with tests for both.
**Git:** tag `phase-6` before starting.

### Before Phase 6 — Checkout and payments (2026-10-09)

**Done so far:** Phases 1–5: setup, database, login, catalogue, cart (guest + saved, merge on login).
**Not finished / carried over:** None.
**Open blockers:** B-01 (Razorpay test keys from the client), B-07 (email domain — Resend's test sender used until then).
**Plan for this phase:** Address form (Indian mobile/pincode/state validation); PENDING order + price snapshots in one transaction; Razorpay order + Payment row; browser checkout; signature check before trusting anything; webhook with signature check; PAID + stock decrement in one idempotent transaction; success and failure/retry pages; cart cleared after PAID; confirmation email; logging; all edge cases from the plan.
**Risks:** Double charging, double stock decrement, overselling the last piece — each covered by a test.
**Git:** tag `phase-5` before starting.

### Before Phase 5 — Cart (2026-10-09)

**Done so far:** Phases 1–4: setup, database, login/registration, catalogue (list, filters, search, product pages).
**Not finished / carried over:** None.
**Open blockers:** None for this phase.
**Plan for this phase:** Guest cart in a cookie, saved cart in the database, merge on login; add/update/remove/clear server actions that always re-read price and stock; stock limits; /cart page; header badge; checkout requires login (placeholder checkout page until Phase 6); Vitest unit tests for the price maths.
**Risks:** Price tampering and overselling — prices never come from the browser; stock re-checked on every change (Phase 9 adds reservations).
**Git:** tag `phase-4` before starting.

### Before Phase 4 — Catalog (2026-10-09)

**Done so far:** Phases 1–3: setup, database (Neon), login/registration with admin protection.
**Not finished / carried over:** Client still to confirm Phase 3 locally (AUTH_SECRET added to .env).
**Open blockers:** B-02 (real photos/design — using dummy illustrations), B-06 (Google keys, optional).
**Plan for this phase:** Catalog service (list with filters/sort/search/pagination, product by slug, categories, featured) with caching; /products page; product detail page; SEO metadata; skeletons, empty states, 404s; home page reads from the database.
**Risks:** Search is simple "name contains" until Phase 15 adds full-text search.
**Git:** tag `phase-3` before starting.

### Before Phase 3 — Authentication (2026-10-09)

**Done so far:** Phases 1–2 complete and verified on the client's machine: Neon database (Singapore, free plan) migrated and seeded; home page shows dummy jewellery.
**Not finished / carried over:** None.
**Open blockers:** B-06 (Google OAuth keys — not blocking; Google login stays hidden until keys are added).
**Plan for this phase:** Auth.js v5 (credentials + Google, Prisma adapter, JWT sessions), /login and /register with Zod errors, id + role in the session, middleware for /account, /checkout, /admin, requireUser()/requireAdmin() helpers, rate limits, header login state, logout.
**Risks:** Account-linking and open-redirect mistakes; covered by defaults D-20 and D-22.
**Git:** tag `phase-2` before starting.

### Before Phase 2 — Database schema (2026-10-08)

**Done so far:** Phase 1 complete: project, env loader, Prisma connection, placeholder layout, `/api/health`. 20 dummy jewellery illustrations and a placeholder home page showing categories and featured products.
**Not finished / carried over:** None.
**Open blockers:** B-03 (pricing model — fixed price default kept; weight and making-charge fields added so we can switch).
**Plan for this phase:** Full schema (users, Auth.js tables, categories, products with jewellery fields, cart, addresses, orders, order items, payments), indexes, migration, idempotent seed script reusing `prisma/seed-data/catalog.ts`.
**Risks:** Schema mistakes are costly later; reviewed against what Phases 3–8 need.
**Git:** tag `phase-1` before starting.

### Before Phase 1 — Project setup (2026-10-08)

**Done so far:** Planning finished. 30-phase plan reviewed and adapted for a jewellery store. Docs folder created (Goal.md, progress.md, blocker.md, note.md, readme.md). Dummy jewellery catalogue (4 categories, 20 products) defined in note.md.
**Not finished / carried over:** Nothing.
**Open blockers:** B-02 (frontend inputs — not blocking, we use placeholders), B-03 (pricing model — default chosen), B-10 (service accounts for Neon/Vercel needed soon).
**Plan for this phase:** Create the Next.js project, folder structure, Prisma connection, env loader, placeholder layout, health route, .env.example and README.
**Risks:** Low.
**Git:** New repository; first commit after Phase 1.
