# Changelog

## Production hardening — 2026-10-25

### Fixed

- **Database migration for Phases 14–16** (reviews, search, audit log, funnel) was missing — a fresh production database would have lacked those tables. Added as an idempotent migration.
- Go-live checklist no longer tells you to refund twice (admin cancel already refunds).

### Added

- `config.ini` for non-secret settings (business details, GST state, invoice prefix, shipping fee, stock hold time, low-stock threshold, SMS flag, log level), validated at startup; any key overridable by env.
- Logger levels (`debug` → `error`), secret redaction, error stacks, child loggers; `errorId` on unexpected API errors; `app.start` integration summary on boot.
- `npm run verify`, `.nvmrc`.
- Docs: ARCHITECTURE, CONFIGURATION, LOGGING, FEATURES, INTEGRATIONS and the `Docs/learning/` path.

### Changed

- `BUSINESS_*`, `GRIEVANCE_OFFICER_*`, `INVOICE_PREFIX`, `SHIPPING_FEE_RUPEES`, `FREE_SHIPPING_ABOVE_RUPEES`, `FEATURE_SMS`, `ADMIN_ALERT_EMAIL` are now read from `config.ini` (env values still override).
- README shortened; feature guides moved to `Docs/FEATURES.md`, setup steps to `Docs/INTEGRATIONS.md`. Docker instructions removed.

## Week 2 release — 2026-10-11

### Added

- **Stock holds (Phase 9):** pieces are held for 15 minutes at payment; the last piece can't be sold twice; abandoned holds are released automatically.
- **Shipping (Phase 10):** Shiprocket shipments (courier, AWB, label, pickup), tracking webhook → Shipped/Delivered, customer tracking timeline, pincode check, shipping fee rule.
- **Cancellations, returns, refunds (Phase 11):** cancel before shipping with automatic refund, 7-day returns with admin approval, partial refunds, refund webhooks, retry without double refunds.
- **GST invoices and emails (Phase 12):** CGST+SGST / IGST, gap-free invoice numbers, PDF download, designed order emails, optional SMS.
- **Coupons and wishlist (Phase 13):** percent/flat coupons with limits that hold under simultaneous orders; wishlist with move to cart.
- **Reviews (Phase 14):** verified-buyer reviews with moderation, star ratings, Google rating data.
- **Search and SEO (Phase 15):** typo-tolerant search with suggestions, price/stock/rating filters, collection pages, sitemap, robots.txt, share images.
- **Analytics and reports (Phase 16):** cookie consent + GA4 e-commerce events, sales reports (daily/weekly, top products, refunds, funnel), CSV export, low-stock email, admin activity log, backup guide.
- **Storefront redesign v1:** velvet/pearl palette, Marcellus + Figtree, jharokha arch motif, new header/home/footer.

### Fixed (found by tests)

Prices with paise were rounded; 1 MB upload limit; Sentry blocking buttons on older Chrome; admin forms losing typed values; stale review averages under simultaneous approvals; over-broad "jhumka" search synonyms; product views double-counted after add to cart.
