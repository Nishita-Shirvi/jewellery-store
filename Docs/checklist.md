# Feature Checklist — Jewellery Store

**Last updated:** 2026-10-25 · Detail: `Goal.md`, `progress.md`, `blocker.md` · How the code works: `learning/`

Legend: `[x]` done · `[ ]` pending · ⛔ waiting on client

---

## Week 1 — Core store ✅

### 1. Project setup

- [x] Next.js 15 + TypeScript + Tailwind + shadcn/ui, ESLint + Prettier
- [x] Prisma + PostgreSQL (Neon), Zod env validation
- [x] `/api/health` endpoint, `.env.example`, README

### 2. Database schema

- [x] Users, products, categories, cart, orders, payments, addresses
- [x] Jewellery fields (metal, purity, colour, weight in mg, gemstone, HUID)
- [x] Migrations + seed data (admin, 4 categories, 20 products)

### 3. Authentication

- [x] Email/password login and register, rate-limited
- [x] Role-based route protection (customer / admin)
- [ ] ⛔ Google login — code done, needs Google keys (B-06)

### 4. Catalog

- [x] Product listing with pagination, sort, search
- [x] Filters: category, metal, purity, price
- [x] Product detail page with SEO metadata

### 5. Cart

- [x] Guest cart (cookie) merged on login
- [x] Server-side price/stock checks, stock limits

### 6. Checkout & payments (Razorpay)

- [x] Address management, order creation in a transaction
- [x] Signature verification + webhooks (idempotent)
- [x] Success / failure / retry pages, confirmation email
- [ ] ⛔ Test with real Razorpay keys (B-01)

### 7. Customer account & admin panel

- [x] Customer orders and addresses
- [x] Admin dashboard, products, orders, categories
- [x] Image upload (Cloudinary — needs keys)

### 8. Hardening & deployment

- [x] Security headers, rate limits, error boundary, Sentry
- [x] Unit tests (Vitest) + E2E test (Playwright), CI
- [x] Legal pages (placeholder text)
- [ ] ⛔ Deploy to Vercel + custom domain + live Razorpay keys (B-10, B-07)
- [ ] ⛔ Real business details for legal pages (B-04)

---

## Week 2 — Running the store ✅

### 9. Inventory reservation

- [x] 15-minute stock reservation, auto-release cron
- [x] Overselling prevention (concurrency tested)

### 10. Shipping (Shiprocket)

- [x] Create shipment, AWB, label PDF
- [x] Tracking webhook + customer tracking timeline
- [x] Pincode serviceability, configurable shipping fee
- [ ] ⛔ Shiprocket account + KYC (B-05)

### 11. Cancellations, returns, refunds

- [x] Cancel before shipping → automatic refund
- [x] Return requests (7 days), admin approval, partial refunds
- [x] Refund webhooks, restock, customer emails

### 12. GST invoices & emails

- [x] HSN / GST per product, CGST+SGST / IGST split
- [x] PDF tax invoice with sequential numbering
- [x] Order status emails (confirmed, shipped, delivered, cancelled, refunded)
- [ ] ⛔ SMS via MSG91 (B-08) and CA review of GST rates (B-09)

### 13. Coupons & wishlist

- [x] Coupon rules (type, min order, cap, dates, usage limits)
- [x] Admin coupon management
- [x] Wishlist (add, remove, move to cart)

### 14. Reviews

- [x] Verified-buyer reviews with rating, images, moderation
- [x] Average rating + Google structured data

### 15. Search, SEO, performance

- [x] Typo-tolerant search with autocomplete
- [x] Sitemap, robots.txt, canonical URLs, collection pages
- [ ] Lighthouse ≥ 90 (to be measured after deployment)

### 16. Analytics, reports, release

- [x] GA4/PostHog events + cookie consent
- [x] Admin reports (revenue, top products, funnel, refunds) + CSV export
- [x] Low-stock email alerts, admin audit log
- [x] Backup/restore steps, changelog

---

## Production hardening ✅ (2026-10-25)

- [x] Missing database migration for Phases 14–16 added (reviews, search, audit log) — verified on a fresh PostgreSQL
- [x] `config.ini` for non-secret settings, validated at startup, env overrides
- [x] Structured logger: levels, redaction, error stacks, Sentry, `app.start` summary, `errorId`
- [x] `npm run verify`, `.nvmrc`, Sentry deprecations fixed, `console.*` banned in server code
- [x] Docs: architecture, configuration, logging, features, integrations, learning path
- [x] Full test run: unit, database, build, bundle secret scan, Playwright end-to-end

## Week 3 — Growth and scale ⬜

### 17. Product variants

- [ ] Options, variants, per-variant SKU / price / stock
- [ ] Migrate existing products to default variants
- [ ] Cart, orders, invoices per variant; admin bulk edit

### 18. Cash on delivery & payment options

- [ ] COD orders with rules (max value, pincodes, fee, blocklist)
- [ ] OTP before COD order (needs MSG91)
- [ ] COD remittance, RTO restock
- [ ] UPI, netbanking, EMI

### 19. Background jobs

- [ ] Job queue (Inngest / BullMQ) with retries
- [ ] Webhooks queued; dead-letter view with retry
- [ ] Redis caching

### 20. Abandoned cart & marketing

- [ ] Abandoned cart emails (1h / 24h)
- [ ] Newsletter with double opt-in
- [ ] Back-in-stock alerts
- [ ] Referral codes, campaign stats

### 21. Staff roles & permissions

- [ ] Roles (Owner, Manager, Catalog Editor, Order Manager, Support)
- [ ] Permission checks on every admin action
- [ ] Staff invites + 2FA

### 22. Customer support

- [ ] Help centre FAQs
- [ ] Support tickets with attachments + admin inbox
- [ ] Optional WhatsApp / live chat

### 23. Security, PWA, release

- [ ] OWASP review, IDOR tests
- [ ] CSP, account lockout, password reset
- [ ] Installable PWA
- [ ] k6 load test (200 users)

---

## Week 4 — Launch readiness ⬜

### 24. Merchandising & CMS

- [ ] Collections (manual + rule-based)
- [ ] Homepage builder with scheduled sections
- [ ] Announcement bar, sale badges, editable pages

### 25. Recommendations

- [ ] Frequently bought together, similar, recently viewed, trending
- [ ] Free-shipping upsell in cart

### 26. Monitoring & alerts

- [ ] Structured logs, Sentry tracing, uptime checks
- [ ] Business alerts + `/admin/system` page + runbook

### 27. Privacy & legal compliance

- [ ] Download my data / delete my account
- [ ] Consent management (email, SMS, analytics)
- [ ] Seller / grievance info on product pages
- [ ] Encrypted phone numbers and addresses

### 28. Accessibility, Hindi, UX polish

- [ ] WCAG 2.1 AA (axe checks)
- [ ] English + Hindi
- [ ] Sticky add-to-cart, pincode autofill, dark mode

### 29. Accounting & integrations

- [ ] Razorpay + COD reconciliation
- [ ] GST reports (GSTR-1 format)
- [ ] Zoho Books / Tally sync
- [ ] Bulk product CSV import/export, public API

### 30. Disaster recovery, docs, launch

- [ ] Backup restore drill, kill switches
- [ ] Architecture, onboarding, admin guide docs
- [ ] Full regression + soft launch

---

## Final frontend design 🟨 (in progress)

- [x] Design system, header, footer
- [x] Home page, product card, product page
- [ ] Product listing page
- [ ] Cart and checkout pages
- [ ] Account and auth pages
- [ ] Admin panel redesign
- [ ] Real product data and photos (⛔ B-02)
