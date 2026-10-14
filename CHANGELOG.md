# Changelog

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
