# Goals — Jewellery Store (Phase by Phase)

This file lists what must be finished in every phase before moving to the next one.
Tick a box only when it has been built **and** verified.

## How to read this file

- **Backend goals** are the main focus right now. They must be fully finished and tested.
- **Frontend (placeholder) goals** are kept minimal. We use dummy data and placeholder images, with simple default styling, just enough to click through and test the backend. The real design comes later, once the client's inputs (logo, brand colours, photos, content) arrive. See `note.md` → "Frontend approach".
- **Jewellery-specific** points adapt the original plan to a jewellery store.
- **Done when** is the test that closes the phase.

---

## Week 1 — Core store

### Phase 1 — Project setup

**Backend**

- [x] Next.js 15 + TypeScript (strict) + Tailwind + shadcn/ui project created, with ESLint + Prettier
- [x] Folders: `app/`, `components/`, `lib/`, `services/`, `prisma/`, `types/`, `Docs/`
- [x] Prisma connected to PostgreSQL through `DATABASE_URL`
- [x] `lib/env.ts`: Zod-validated env loader that stops the app at startup if a variable is missing
- [x] `/api/health` returns `{ status: "ok", db: "ok" }` after a database ping
- [x] `.env.example` and root `README.md` with setup steps

**Frontend (placeholder)**

- [x] Basic header (store name text as logo, search box placeholder, cart icon, login button) and footer, responsive

**Done when:** `npm run dev` works, `/api/health` returns ok, lint passes.

### Phase 2 — Database schema

**Backend**

- [x] Models: User (CUSTOMER/ADMIN), Account/Session, Category, Product, Cart, CartItem, Address, Order, OrderItem, Payment
- [x] Money stored as integers in paise
- [x] Indexes on slug, categoryId, userId, order status
- [x] Migration created and applied
- [x] Seed script: 1 admin, 4 jewellery categories, 20 jewellery products (reuse `prisma/seed-data/catalog.ts` and its images)

**Jewellery-specific**

- [x] Product has jewellery fields: metal type (Gold / Silver / Platinum), purity (22K, 18K, 14K, 925), metal colour (yellow / white / rose), gross and net weight stored as integers in **milligrams**, gemstone details, hallmark HUID (optional), making charge in paise
- [x] Price stays a fixed `priceInPaise` for now (pricing model decision is open — see `blocker.md` B-03)

**Done when:** `npx prisma migrate dev` and `npx prisma db seed` succeed and the jewellery data shows in Prisma Studio.

### Phase 3 — Authentication

**Backend**

- [x] Auth.js v5 with email/password (bcrypt) and Google login, Prisma adapter (Google code done; needs your Google keys to test — B-06)
- [x] User id and role included in the session
- [x] `middleware.ts` protects `/account/*`, `/checkout/*`, `/admin/*` (admin needs ADMIN role)
- [x] `requireUser()` and `requireAdmin()` helpers for server actions and APIs
- [x] Rate limits on login and register

**Frontend (placeholder)**

- [x] Plain `/login` and `/register` forms with Zod validation and clear error messages

**Done when:** register, log in and log out work; a customer is blocked from `/admin`; the admin can open it.

### Phase 4 — Catalog

**Backend**

- [x] Service for product listing: pagination, category filter, sort by price/newest, search by name (server-side, using URL query params)
- [x] Service for product detail by slug; 404 for unknown or inactive products
- [x] Caching for catalog reads; SEO metadata (title, description, OG image)

**Jewellery-specific**

- [x] Extra filters: metal type, purity, price range
- [x] Product detail returns weight, purity, gemstone and hallmark info

**Frontend (placeholder)**

- [x] Home page, product grid and product page read from the database (replace `services/dummy-catalog.service.ts`); loading skeletons and empty states

**Done when:** browsing, filtering, searching and product detail all work on mobile and desktop.

### Phase 5 — Cart

**Backend**

- [x] Guest cart in a cookie, merged into the database cart on login
- [x] Server actions: add, update quantity, remove, clear
- [x] Price and stock always re-read from the database; client prices never trusted
- [x] Quantity above available stock is blocked

**Frontend (placeholder)**

- [x] Basic `/cart` page with line totals, subtotal, "Proceed to Checkout" (needs login); cart badge count

**Done when:** cart survives refresh and login, prices can't be tampered with, stock limits work.

### Phase 6 — Checkout and payments (most critical)

**Backend**

- [x] Address selection/creation with Zod validation
- [x] On "Pay": Order (PENDING) + OrderItems with price snapshots created in one transaction, totals recalculated on the server
- [x] Razorpay order created and Payment row stored
- [x] Payment signature verified on the server (HMAC SHA256) before trusting anything
- [x] Webhook `/api/webhooks/razorpay`: signature verified; `payment.captured` and `payment.failed` handled
- [x] Order marked PAID and stock reduced in one transaction; idempotent (same payment processed only once)
- [x] Cart cleared only after PAID; confirmation email sent (Resend — logged until RESEND_API_KEY is set)
- [x] Every payment step logged
- [x] Handled: popup closed, double clicks, webhook before callback, duplicate webhooks, stock running out mid-checkout

**Frontend (placeholder)**

- [x] Simple checkout page, success page, and failure page with retry

**Done when:** a test payment marks the order PAID, a failed one marks it FAILED, and replaying the same webhook twice changes nothing.

### Phase 7 — Customer account and admin panel

**Backend**

- [x] Customer: order list and detail, address management (own data only)
- [x] Admin dashboard data: today's orders, revenue, low-stock products
- [x] Admin products: list, create, edit, deactivate, image upload (Cloudinary — works once keys are added; placeholder picker until then), stock editing
- [x] Admin orders: list with status filter, detail, status update with allowed transitions only (PAID → SHIPPED → DELIVERED, or CANCELLED)
- [x] Admin categories: create, read, update, delete
- [x] Every admin API checks the role on the server

**Jewellery-specific**

- [x] Admin product form includes metal, purity, weight, gemstone and HUID fields

**Frontend (placeholder)**

- [x] Basic shadcn data tables with pagination and confirmation dialogs

**Done when:** the admin adds a product that appears in the store and moves an order through its statuses; a customer cannot call any admin API.

### Phase 8 — Hardening and deployment

**Backend**

- [x] Security headers, CSRF-safe server actions, input validation review, no secrets on the client
- [x] Rate limits on auth, checkout and webhooks
- [x] Vitest unit tests for pricing, cart and order services
- [x] Playwright test: browse → cart → checkout (Razorpay test mode)
- [x] Global error boundary, structured logging, Sentry
- [ ] Deployed to Vercel (steps in Docs/DEPLOY.md — needs the client's Vercel/GitHub accounts) + Neon with production env vars and migrations; Razorpay webhook URL set; custom domain with HTTPS
- [x] Go-live checklist, including switching Razorpay test keys to live keys

**Frontend (placeholder)**

- [x] Legal pages with placeholder text: Privacy, Terms, Refund/Cancellation, Shipping, Contact (real text needed — see `blocker.md` B-04)

**Done when:** all tests pass in GitHub Actions and the production site completes a real low-value payment.

---

## Week 2 — Running the store

### Phase 9 — Inventory reservation

- [x] Stock is reserved for 15 minutes when an order is created, not reduced
- [x] Available stock = stock − active reservations, used everywhere
- [x] On PAID: reservation becomes a real stock reduction in one transaction; on FAILED/expiry: released
- [x] Cron job `/api/cron/release-reservations`, protected by `CRON_SECRET`
- [x] Atomic conditional updates or row locks to prevent overselling
- [x] Test: two users buying the last item at the same time

**Jewellery-specific:** many jewellery items are one-of-a-kind (stock = 1), so this phase matters more than usual.

**Done when:** the last unit can't be sold twice, and abandoned checkouts return stock after 15 minutes.

### Phase 10 — Shipping (Shiprocket)

- [x] Admin "Create Shipment" on PAID orders: Shiprocket order → courier → AWB + label PDF
- [x] Shipment model: orderId, awb, courier, trackingUrl, status, rawPayload
- [x] Webhook `/api/webhooks/courier-updates` (token verified; Shiprocket rejects URLs containing "shiprocket") updates status and moves the order to SHIPPED/DELIVERED
- [x] Tracking timeline and link available for the customer's order page
- [x] Pincode serviceability check (cached)
- [x] Shipping fee rule configurable (e.g. free above a set amount)

**Jewellery-specific:** confirm couriers that accept jewellery, declared value limits and shipment insurance (see `blocker.md` B-05).

**Done when:** a test order gets an AWB, the label downloads, and a webhook updates the customer's order page.

### Phase 11 — Cancellations, returns, refunds

- [x] Customer cancels a PAID order before shipping → automatic full refund via Razorpay
- [x] Return request within 7 days of delivery (reason + optional photo); admin approves or rejects
- [x] ReturnRequest and Refund models; partial refunds per item
- [x] `refund.processed` / `refund.failed` webhooks handled idempotently
- [x] Restock on cancellation/approved return (configurable)
- [x] REFUND_PENDING / REFUNDED / RETURN_REQUESTED statuses in one state-machine function
- [x] Email to the customer at each step

**Jewellery-specific:** decide which items are non-returnable (e.g. customised or engraved pieces, earrings for hygiene). Default: flag `isReturnable` on the product.

**Done when:** cancel → refund and return → approve → refund both work in test mode, and replayed webhooks change nothing.

### Phase 12 — GST invoices and emails

- [x] HSN code and GST rate on each product; tax breakdown (CGST + SGST or IGST) saved on OrderItem at purchase
- [x] PDF tax invoice on PAID, sequential invoice number (concurrency-safe); invoice data frozen in the database and the PDF rendered on demand (see D-84)
- [x] Customer and admin can download invoices
- [x] Email templates: confirmed, shipped, delivered, cancelled, refunded — all sent through one notification service
- [x] Optional SMS via MSG91 behind a feature flag (FEATURE_SMS; needs DLT-approved template — B-08)

**Jewellery-specific:** default GST 3% with HSN 7113 for jewellery (to be confirmed by a CA — see `note.md`). Invoice shows metal, purity, weight and HUID per item.

**Done when:** the invoice shows the correct tax split for same-state and other-state addresses, and all emails render correctly.

### Phase 13 — Coupons and wishlist

- [x] Coupon model with all rules (type, value, minimum order, max discount, dates, usage limits, active flag)
- [x] Discount calculated only on the server in a pricing service and saved on the Order
- [x] Redemptions tracked inside the payment transaction (no limit bypass)
- [x] Admin coupon management
- [x] Wishlist: add/remove, list, move to cart

**Done when:** expired, over-used or below-minimum coupons are rejected with a clear message, and tests cover every pricing rule.

### Phase 14 — Reviews

- [x] Only customers with a delivered order of that product can review (1 per user per product)
- [x] Rating 1–5, title, body, optional images, moderation status
- [x] Admin moderation queue
- [x] Average rating and review count kept on Product, updated in a transaction
- [x] Product + AggregateRating structured data for Google
- [x] Sorting and pagination of reviews

**Done when:** only verified buyers can review, approved reviews appear, and the average updates correctly.

### Phase 15 — Search, SEO, performance

- [x] Full-text search with typo tolerance and autocomplete
- [x] Filters: price range, in stock only, rating
- [x] sitemap.xml, robots.txt, canonical URLs, category landing pages
- [x] next/image everywhere, ISR with revalidation on admin edits, missing indexes added, no N+1 queries
- [ ] Lighthouse ≥ 90 (not measured yet — run on the deployed site; see D-108) (performance + SEO, mobile), with before/after scores

**Jewellery-specific:** search understands common terms (e.g. "jhumka", "kada", "mangalsutra", "22k").

**Done when:** search handles typos, the sitemap lists all active products, and Lighthouse targets are met.

### Phase 16 — Analytics, reports, release

- [x] GA4 or PostHog e-commerce events with cookie consent banner
- [x] Admin reports: revenue by day/week, top products, funnel, refunds, low-stock email alerts, CSV export
- [x] Audit log of admin changes
- [x] Automated backups confirmed and restore steps written
- [x] Browser test suites cover coupons (24 checks) and refunds (34 checks); Playwright CI test still covers browse → cart → checkout
- [x] Week 2 release checklist and changelog

**Done when:** CI is green, reports match the database, and the release is deployed.

---

## Week 3 — Growth and scale

### Phase 17 — Product variants

- [ ] ProductOption, ProductOptionValue, ProductVariant (unique SKU, price, stock, images, active)
- [ ] Every existing product converted to one default variant with no data lost
- [ ] Cart, reservations, orders, invoices, coupons and shipping work per variant
- [ ] Admin: generate combinations, bulk edit price/stock, SKU validation

**Jewellery-specific:** typical options are ring size (Indian sizes), metal colour (yellow/white/rose), purity (22K/18K/14K), chain length and bangle size. Weight differs per variant, so weight moves to the variant.

**Done when:** old orders still display correctly, a product with 3 sizes × 2 colours can be bought per variant, and stock is tracked per variant.

### Phase 18 — Cash on delivery and payment options

- [ ] COD orders go to CONFIRMED with paymentMethod COD; Shiprocket COD shipment
- [ ] COD rules: max order value, pincode allowlist, optional fee, block users with 2+ refused deliveries
- [ ] OTP by SMS before placing a COD order
- [ ] COD marked paid after delivery + cash remittance; RTO restocks and flags the user
- [ ] UPI, netbanking and EMI enabled in Razorpay
- [ ] Invoices, reports and state machine updated for COD

**Jewellery-specific:** keep the COD limit low by default (high value means high fraud and RTO risk). Check cash and PAN rules for high-value purchases with a CA (see `note.md`).

**Done when:** a COD order goes placed → shipped → delivered → paid, RTO restocks, and COD is blocked where the rules say so.

### Phase 19 — Background jobs

- [ ] Inngest (or BullMQ + Upstash Redis) set up
- [ ] Emails/SMS, invoices, shipment creation, webhook processing, low-stock alerts and reservation expiry run as jobs with retries
- [ ] Webhooks only verify, save to WebhookEvent (unique eventId), return 200, and queue the work
- [ ] Admin dead-letter view with a retry button
- [ ] Redis caching for hot reads, cleared on admin edits

**Done when:** checkout speed doesn't depend on email/PDF/Shiprocket, a forced failure retries then shows in the dead-letter view, and the cache clears on product edit.

### Phase 20 — Abandoned cart and marketing

- [ ] Abandoned cart emails at 1h and 24h (optional single-use coupon); stop on purchase or unsubscribe
- [ ] Newsletter with double opt-in, unsubscribe link, consent stored with timestamp
- [ ] Back-in-stock "Notify me" emails
- [ ] Referral codes with reward after the referred user's first delivered order; no self-referral
- [ ] Campaign stats in admin

**Done when:** the abandoned-cart sequence works with short test timers, unsubscribe is honoured, and back-in-stock emails fire on restock.

### Phase 21 — Staff roles and permissions

- [ ] Role, Permission, RolePermission, UserRole models; seeded roles OWNER, MANAGER, CATALOG_EDITOR, ORDER_MANAGER, SUPPORT
- [ ] `requirePermission()` used in every admin action and API
- [ ] Owner invites, assigns roles to and deactivates staff
- [ ] 2FA (TOTP) required for staff
- [ ] Every protected action written to the audit log

**Done when:** a SUPPORT user can view orders but gets a 403 on refunds and product edits even via direct API calls, and staff 2FA is enforced.

### Phase 22 — Customer support

- [ ] Help centre FAQs managed from admin, searchable
- [ ] Support tickets linked to orders, with attachments, threads and statuses
- [ ] Support inbox with assignment, filters, canned replies, email notifications
- [ ] Order shortcuts: Track, Cancel, Return, Get help
- [ ] Optional WhatsApp/live chat behind a feature flag
- [ ] Tickets older than 24h without reply highlighted

**Done when:** a customer can raise and follow a ticket end to end, support can reply and resolve it, and attachments are stored safely.

### Phase 23 — Security, PWA, release

- [ ] OWASP Top 10 review, including IDOR tests for orders, addresses and tickets
- [ ] CSP, secure cookies, session expiry, account lockout, password reset with expiring tokens
- [ ] Installable PWA with offline fallback page
- [ ] k6 load test at 200 concurrent users; bottlenecks fixed
- [ ] E2E tests for variants, COD, coupons, support
- [ ] Week 3 release checklist and changelog

**Done when:** no high/critical security findings remain, k6 targets pass, CI is green, and the release is deployed.

---

## Week 4 — Launch readiness

### Phase 24 — Merchandising and CMS

- [ ] Manual and rule-based collections with SEO pages
- [ ] Homepage builder with scheduled sections and mobile/desktop images
- [ ] Announcement bar and sale badges (compare-at price, % off on the server)
- [ ] Editable static pages with markdown and preview
- [ ] Draft/publish with preview links and cache refresh

**Jewellery-specific:** ready-made collections for occasions (Bridal, Daily Wear, Festive, Gifts) and festival scheduling (Akshaya Tritiya, Dhanteras, Diwali, wedding season).

**Done when:** the owner schedules a sale banner and collection for a future date without a deploy, and it goes live and expires automatically.

### Phase 25 — Recommendations

- [ ] "Frequently bought together" from a nightly idempotent job
- [ ] "Similar products", "Recently viewed", "Trending"
- [ ] Cart upsell for free shipping
- [ ] Click/conversion tracking per widget
- [ ] Recommendations read from cache

**Done when:** widgets show sensible items for the dummy data, the nightly job is idempotent, and pages don't get slower.

### Phase 26 — Monitoring and alerts

- [ ] Structured JSON logs with request/correlation IDs; no personal data or secrets in logs
- [ ] Sentry tracing and release tracking
- [ ] Uptime checks on home, health, checkout and webhooks
- [ ] Business alerts (no orders, high payment failures, dead-letter jobs, webhook failures, top-seller stock-outs, error spikes)
- [ ] `/admin/system` health page
- [ ] `RUNBOOK.md` entry for every alert

**Done when:** a simulated payment outage alerts within 5 minutes, and every alert has a runbook entry.

### Phase 27 — Privacy and legal compliance

- [ ] "Download my data" and "Delete my account" (keeping tax records)
- [ ] Separate consents for email, SMS and analytics, logged and respected
- [ ] Auto-purge of old data on a schedule
- [ ] Seller details, grievance officer, country of origin, total price with taxes, return policy on product pages
- [ ] Phone numbers and addresses encrypted at the application level
- [ ] Privacy policy and terms updated to match the system

**Jewellery-specific:** show BIS hallmark / HUID details on product pages where applicable.

**Done when:** data export and deletion work end to end, consent toggles change behaviour, and seller/grievance info is visible.

### Phase 28 — Accessibility, Hindi, UX polish

- [ ] WCAG 2.1 AA pass with axe checks in Playwright
- [ ] English + Hindi with next-intl, language switcher, hreflang
- [ ] UX polish: skeletons, optimistic cart, sticky Add to Cart on mobile, address autofill from pincode
- [ ] Dark mode

**Note:** most of this phase overlaps with the real frontend design. It should be done after the final design is in place.

**Done when:** no serious axe violations, the whole purchase flow works by keyboard and in Hindi, and mobile accessibility score ≥ 95.

### Phase 29 — Accounting and integrations

- [ ] Daily Razorpay settlement reconciliation with mismatch flags
- [ ] COD remittance reconciliation
- [ ] GST reports (B2C sales register, HSN summary, credit notes) in GSTR-1 friendly format
- [ ] Zoho Books or Tally sync via background job
- [ ] Bulk product CSV import/export with per-row errors and dry run
- [ ] Public read-only Products API and outgoing webhooks with API keys

**Done when:** one month of test data reconciles with zero unexplained differences, GST totals match invoices, and a 500-row CSV imports with clear row errors.

### Phase 30 — Disaster recovery, docs, launch

- [ ] Backup restore actually performed and timed; RPO/RTO defined
- [ ] Media and env var backup documented
- [ ] Kill switches for checkout, COD, coupons, recommendations
- [ ] ARCHITECTURE.md, ONBOARDING.md, ADMIN_GUIDE.md, complete `.env.example`
- [ ] Full regression: unit, e2e, accessibility, k6 at 2× expected traffic
- [ ] Production readiness checklist completed
- [ ] Soft launch plan, first-24h metrics, rollback steps

**Done when:** the restore drill succeeds, all docs exist, every checklist item is ticked, and the store is launched.

---

## Future phase (not yet scheduled) — Final frontend design

To start once the client provides brand inputs (see `blocker.md` B-02).

- [ ] Replace placeholder UI with the final design across storefront and admin
- [ ] Replace dummy products and images with real catalogue data and photos
- [ ] Re-run Lighthouse, accessibility and e2e tests after the redesign
