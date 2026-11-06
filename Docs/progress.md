# Progress

**Updated:** 6 Nov 2026

**Where we are:** all 30 phases are built. Phases 28, 30 and the design pages are in PR #18, waiting to be merged. After that, we wait for the client's inputs (see `blocker.md` and `BACKLOG.md`).

**Rule:** before starting a phase, add a "Before Phase X" note to the log below. When it's finished, tick it here.

---

## Phases

✅ done · 🟨 in progress

**Week 1 — the shop works**

- ✅ 0 · Planning and docs
- ✅ 1 · Project setup
- ✅ 2 · Database
- ✅ 3 · Login and sign-up (Google login waits for keys)
- ✅ 4 · Product catalogue
- ✅ 5 · Cart
- ✅ 6 · Checkout and payments
- ✅ 7 · Customer account and admin panel
- ✅ 8 · Security and deployment setup

**Week 2 — orders end to end**

- ✅ 9 · Stock held while paying (never oversold)
- ✅ 10 · Shipping with Shiprocket
- ✅ 11 · Cancellations, returns, refunds
- ✅ 12 · GST invoices and order emails
- ✅ 13 · Coupons and wishlist
- ✅ 14 · Reviews and ratings
- ✅ 15 · Search, SEO, speed
- ✅ 16 · Reports and analytics

**Week 3 — running the business**

- ✅ 17 · Sizes and colours (variants)
- ✅ 18 · Cash on delivery (live SMS needs MSG91)
- ✅ 19 · Background jobs (emails, invoices, retries)
- ✅ 20 · Cart reminders and marketing emails
- ✅ 21 · Staff roles, permissions, two-step sign-in
- ✅ 22 · Customer support messages
- ✅ 23 · Security review, installable app, load test (200 shoppers at once, no errors)

**Week 4 — growth and launch**

- ✅ 24 · Homepage banners, collections, pages (with scheduling)
- ✅ 25 · Recommendations ("you may also like", "bought together")
- ✅ 26 · Monitoring and alerts
- ✅ 27 · Privacy: consents, data download, account deletion, encryption
- ✅ 28 · Accessibility checks, keyboard checkout, pincode → state, sticky Add to cart (Hindi and dark mode wait for the final design)
- ✅ 29 · GST reports, payment and COD reconciliation, bulk product import, API and webhooks
- ✅ 30 · Backup restore test, kill switches, launch guides

**Design**

- 🟨 F · Final look. All storefront pages are done; waiting for the real logo, photos and product details.

The detailed test numbers for each phase are in its pull request (and in the older version of this file in git history).

---

## Pre-phase log (newest first)

### Before Phase 28 — Accessibility and UX polish (2026-11-05)

**Done so far:** Phases 1–27, 29, 30 (29 and 30 in PRs #15/#16).
**Not finished / carried over:** BL-1…BL-3; BL-4…BL-7 need Vineet.
**Open blockers:** Final design (Phase F) for Hindi, dark mode and the optimistic cart — moved to BACKLOG BL-8…BL-10.
**Plan for this phase:** axe (WCAG 2.1 AA) checks in Playwright on shopper and admin pages; the whole purchase by keyboard; State filled from the pincode (no outside service); sticky Add to cart on phones; loading skeletons.
**Risks:** a pincode guess that's wrong (shared prefixes are left blank); overwriting a state the customer chose; a second "Add to cart" button confusing screen readers.
**Git:** branch `week4-phase28` from f7b8852.

### Before Phase 30 — Disaster recovery, docs, launch (2026-11-05)

**Done so far:** Phases 1–29 (Phase 29 in PR #15, CI pending).
**Not finished / carried over:** BL-1…BL-3 (non-breaking); BL-4, BL-5, BL-6 need Vineet.
**Open blockers:** A restore drill against production needs production database access (BL-7). Launching needs the go-live checklist (Razorpay KYC, domain, legal review).
**Plan for this phase:** a restore drill script with timings and RPO/RTO; kill switches for checkout, COD, coupons and recommendations; ONBOARDING, ADMIN_GUIDE, LAUNCH (soft launch, first 24 h, rollback); complete `.env.example`; production readiness checklist.
**Risks:** a switch that only hides a button (old tabs still order); a switch stuck "off" when its setting can't be read; a drill that touches the live database.
**Git:** branch `week4-phase30` from 193cbb0.

### Before Phase 29 — Accounting and integrations (2026-11-05)

**Done so far:** Phases 1–27 merged to main (9e0c156); manual delivery tracking, payment fallback and error pages (e472277).
**Not finished / carried over:** BL-1…BL-3 (non-breaking), BL-4/BL-5 need Vineet.
**Open blockers:** None for this phase. Razorpay keys only add the automatic daily settlement check; Zoho/Tally accounts would allow a live sync (BACKLOG).
**Plan for this phase:** GST reports (sales register, B2CS, HSN, credit notes) that match the invoices; Razorpay settlement and COD remittance reconciliation from uploaded files; bulk product CSV import/export; read-only Products API with keys; signed outgoing webhooks; invoice buyer details encrypted.
**Risks:** tax totals that don't match invoices; an import that half-applies; API leaking hidden products or costs; webhooks used to reach internal addresses.
**Git:** branch `week4-phase29` from e472277.

### Before Phase 27 — Privacy and compliance (2026-11-04)

**Done so far:** Phases 1–26; PR #12 (Phases 24–26) open, CI green, code-review fixes applied, Docs/BACKLOG.md started.
**Not finished / carried over:** BL-1…BL-3 in Docs/BACKLOG.md (non-breaking).
**Open blockers:** B-04 (business and grievance details in config.ini — shown on product pages and policies), B-09 (lawyer/CA review of the policy wording).
**Plan for this phase:** consents with a log; download my data; delete my account (orders kept); scheduled clean-up; seller / grievance / country of origin on product pages; addresses and phone numbers encrypted; policy text matching the system.
**Risks:** making existing addresses unreadable (key handling); deleting tax records; consents that don't change anything; marketing to people who never opted in.
**Git:** branch `week4-part2` from aac4ddd.

### Before Phase 26 — Monitoring and alerts (2026-11-04)

**Done so far:** Phases 1–25 (latest 3ee5efb, recommendations).
**Not finished / carried over:** None.
**Open blockers:** B-07 (Resend + domain) for alert emails to arrive; Sentry DSN (B-10) for error tracking. Alerts still show on Admin → System without them.
**Plan for this phase:** correlation ids in logs; Sentry releases; uptime checks; six business alerts with start / reminder / resolved emails; Admin → System; RUNBOOK.md.
**Risks:** alert storms (duplicate emails), logging floods during an error storm, alerts nobody can act on, an outage noticed too late.
**Git:** after 3ee5efb on `week4-launch`.

### Before Phase 25 — Recommendations (2026-11-04)

**Done so far:** Phases 1–24 (latest 3fe3a66, merchandising).
**Not finished / carried over:** None.
**Open blockers:** None for this phase (few real orders yet, so widgets fall back to sensible defaults).
**Plan for this phase:** nightly idempotent job for bought-together and trending; similar, recently viewed, trending widgets; free-shipping upsell; click/add-to-cart/purchase tracking per widget; reads from cache.
**Risks:** slower pages; a nightly job that doubles rows when run twice; stats writes contending under load; tracking cookies trusted blindly.
**Git:** after 3fe3a66 on `week4-launch`.

### Before Phase 24 — Merchandising and CMS (2026-11-04)

**Done so far:** Phases 1–23; Week 3 merged to main (fe1c0eb) and deployed on Vercel; CI green.
**Not finished / carried over:** None.
**Open blockers:** B-02 (real photos/brand) — banners use placeholder images until then.
**Plan for this phase:** collections (hand-picked and rule-based), homepage sections, announcement bar, sale ("was") prices with % off, editable pages, draft/publish, preview links, festival scheduling, content.manage permission.
**Risks:** scheduled items stuck behind the page cache; a "was" price that misrepresents the discount; staff-typed text or links injecting scripts; collection addresses clashing with categories.
**Git:** branch `week4-launch` from fe1c0eb.

### Before Phase 23 — Security, PWA, release (2026-11-03)

**Done so far:** Phases 1–22 (latest dd986e1, customer support).
**Not finished / carried over:** None.
**Open blockers:** B-10 (GitHub/Vercel) for the deploy; B-07 for reset emails to arrive.
**Plan for this phase:** independent OWASP review and fixes; IDOR tests; CSP; lockout; password reset; session expiry; PWA with offline page; k6 at 200 users; coupon E2E; release checklist and changelog.
**Risks:** CSP blocking Razorpay/GA; service worker caching private pages; lockout used to annoy customers.
**Git:** after dd986e1 on `week3-growth`.

### Before Phase 22 — Customer support (2026-11-04)

**Done so far:** Phases 1–21 (latest 611e456, staff roles).
**Not finished / carried over:** None.
**Open blockers:** B-07 / RESEND_API_KEY for ticket emails to arrive (tickets work without them; emails are logged). WhatsApp button needs a business number.
**Plan for this phase:** FAQs (/help, searchable, admin-managed); tickets linked to orders with threads, statuses, internal notes, private attachments; support inbox with assignment, filters, saved replies, email alerts, 24 h highlighting; order shortcuts; WhatsApp behind config; support.manage / faqs.manage permissions.
**Risks:** One customer reading another's ticket or photo (IDOR); internal notes leaking; uploaded files run as pages (SVG/HTML); public file URLs.
**Git:** after 611e456 on `week3-growth`.

### Before Phase 21 — Staff roles and permissions (2026-11-03)

**Done so far:** Phases 1–20 (latest 99ef5f3).
**Not finished / carried over:** None.
**Open blockers:** None. Email for invitations works through Resend once B-07 / RESEND_API_KEY are done; until then the owner copies the invite link shown on the page.
**Plan for this phase:** Role / Permission / RolePermission / UserRole (+ invites); requirePermission() in every admin action, page and admin API; owner invites, assigns roles, deactivates; TOTP two-step sign-in for all staff (with recovery codes, owner reset and a CLI reset); every protected action and every refusal in the activity log.
**Risks:** Locking out existing admins (migration makes them OWNER); losing the last owner; a missed action or page; stale role in the session cookie; 2FA codes replayed; recovery codes shown once and lost.
**Git:** after 99ef5f3 on `week3-growth`.

### Before Phase 20 — Abandoned cart and marketing (2026-11-03)

**Done so far:** Phases 1–19 (latest 598d865, background jobs).
**Not finished / carried over:** None.
**Open blockers:** B-07 (domain + SPF/DKIM/DMARC) before marketing emails go to real customers — otherwise they land in spam. B-09/legal: privacy policy should mention newsletter, reminders and referrals (Phase 27).
**Plan for this phase:** One subscriber/"do not email" list with double opt-in and signed unsubscribe links; cart reminders at 1 h / 24 h with optional personal coupon; back-in-stock alerts; referral links with a reward coupon after the friend's first delivered order; personal coupons; admin campaign stats. All emails through the Phase 19 job queue.
**Risks:** Emailing people who unsubscribed; reminders sent twice or after a purchase; mail scanners "clicking" confirm/unsubscribe links; self-referrals; reward coupons used by others or issued twice.
**Git:** after 598d865 on `week3-growth`.

### Before Phase 19 — Background jobs (2026-11-03)

**Done so far:** Phases 1–18 (variants 9f463ae, COD 88e3f39).
**Not finished / carried over:** None.
**Open blockers:** None for this phase. Decided with the client contact: no Inngest / Redis account — the queue lives in the existing Postgres (D-130).
**Plan for this phase:** Job + WebhookEvent tables; enqueue in the same transaction as the change (outbox); run after the response (Next `after()`) and from the scheduler; retries with backoff, DEAD + admin retry; webhooks verify → save → queue → 200; emails/SMS, invoices, shipments, low-stock, reservation release as jobs; cache stays Next's data cache with tag invalidation.
**Risks:** Two workers running one job; timezone bugs in raw SQL (seen in Phase 18); a slow/failing email blocking payment; duplicate webhooks; crashed workers leaving jobs stuck.
**Git:** after 88e3f39 on `week3-growth`.

### Before Phase 18 — COD and payment options (2026-11-03)

**Done so far:** Phases 1–17 (variants committed as 9f463ae).
**Not finished / carried over:** None from Phase 17.
**Open blockers:** B-08 (MSG91 + DLT) for live SMS codes — built against a stand-in; COD stays hidden in production until the keys exist. B-05 (Shiprocket COD + remittance account). B-09 (CA: cash/PAN rules, COD fee tax).
**Plan for this phase:** CONFIRMED status + paymentMethod COD; rules in config.ini [cod]; SMS one-time code; one-transaction order placement; Shiprocket COD shipments; RTO restock + refusal count; cash recorded after delivery; manual refunds for COD; invoices, emails, reports, admin pages.
**Risks:** Codes reused/guessed; double clicks; stock or refusals counted twice from repeated webhooks; cash recorded twice; COD refunds accidentally sent to Razorpay; every place that assumed "PAID = ready to ship".
**Git:** after 9f463ae on `week3-growth`.

### Before Phase 17 — Product variants (2026-11-03)

**Done so far:** Phases 1–16 + production hardening.
**Not finished / carried over:** Frontend design (F) partly done; deploy waits on client accounts (B-01, B-04, B-05, B-10).
**Open blockers:** B-03 (pricing model) — variants keep a fixed price per variant, so a later switch to rate-based pricing stays possible.
**Plan for this phase:** ProductOption / ProductOptionValue / ProductVariant; migration gives every product one base variant (no data lost); cart, holds, orders, invoices, shipping, returns per variant; admin options + combinations + bulk edit; product page picker.
**Risks:** Data loss in migration (verified on a snapshot, one transaction, forced-failure rollback tested); deadlocks between variant and product rows (fixed lock order, 30-buyer storm test); product summary drifting from variants (synced in the same transaction, asserted in tests); old guest-cart cookies (resolved to the base variant).
**Git:** branch `week3-growth` from `main` @ e351c12. Baseline before starting: 165 unit, 25 DB, 3 E2E, build — all green.

### Production hardening pass (2026-10-25)

**Done so far:** Phases 1–16.
**Found:** Phase 14–16 schema changes had no committed migration — a fresh production deploy would have crashed on reviews/search/audit. Fixed with an idempotent migration (D-118).
**Changed:** `config.ini` + `lib/config.ts` for non-secret settings (D-115); logger with levels/redaction/stacks (D-116); `app.start` summary (D-117); `npm run verify`; `.nvmrc`; Sentry config deprecations fixed; GO_LIVE_CHECKLIST double-refund step corrected.
**Verified:** lint, typecheck, 164 unit tests, 25 DB tests on PostgreSQL 16, production build, client-bundle secret scan, 3 Playwright E2E (browse → cart → checkout → pay).
**Docs:** ARCHITECTURE, CONFIGURATION, LOGGING, FEATURES, INTEGRATIONS, `learning/` (6 guides); README rewritten.

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
