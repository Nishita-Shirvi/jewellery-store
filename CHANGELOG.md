# Changelog

## Week 4 — Phase 25: Recommendations — 2026-11-04

### Added

- Product pages: **Often bought together**, **You may also like** and **Recently viewed**.
- Cart: **Add ₹X more for free shipping** with pieces that close the gap, and **Customers also bought**. Empty cart and homepage: **Trending now**.
- A nightly job rebuilds "bought together" and "trending" from orders (safe to run twice; a second run at the same time skips).
- **Admin → Reports → Recommendations:** per row — shown, clicks, click rate, added to cart, bought, revenue.

### Changed

- Recommendation rows load after the page, as the shopper scrolls to them, so pages stay as fast as before.

## Week 4 — Phase 24: Merchandising and CMS — 2026-11-04

### Added

- **Admin → Content:** announcement bar, homepage sections, collections and pages — all with Draft/Published and optional live-from/until dates. Scheduled items go live and disappear on time by themselves.
- **Collections** at `/collections/<address>`: hand-picked products or rules (tags, category, metal, price, on sale, new). One click adds the occasion collections Bridal, Daily Wear, Festive and Gifts (as drafts).
- **Homepage builder:** big image with heading, clickable banners, product rows from a collection, text — with separate phone images. The current homepage stays until a section is published.
- **Sale prices:** a "Was price" per size on the variants page; the shop shows it crossed out with a "% off" badge.
- **Editable pages** (About us, Jewellery care…) at `/pages/<address>`, with simple formatting, a private draft and a Publish button.
- **Preview links** for drafts and scheduled items (48 hours); festival quick dates from `config.ini` `[festivals]`.
- **Product tags** on the product form, used by rule-based collections.

### Changed

- The variants grid's "On sale" column is now called "Available" (it always meant "can be bought"), next to the new "Was price" column.
- Catalog editors can also manage content (new permission `content.manage`).

## Week 3 release summary (Phases 17–23)

Sizes and variants, cash on delivery, background jobs, cart reminders and newsletter, staff roles with two-step sign-in, customer support, and a security pass. Release steps: `Docs/RELEASE_WEEK3.md`. Not yet deployed (waits on client accounts, B-10).

## Week 3 — Phase 23: Security, PWA, release — 2026-11-03

### Added

- **Forgot your password?** on the login page: a reset link by email, valid 30 minutes and once.
- **Account lockout:** 8 wrong passwords lock the account for 15 minutes (resetting the password unlocks it).
- **Install as an app:** customers can add the store to their phone's home screen; a friendly page shows when they're offline.
- Content-Security-Policy on every page; load test script for 200 shoppers (`tests/load/k6-shop.js`).
- `Docs/SECURITY_REVIEW.md` (findings and OWASP Top 10 coverage) and `Docs/RELEASE_WEEK3.md`.

### Changed

- Sign-ins last 14 days (was 30). Changing your password signs you out on other devices.
- Next.js 15.5.28 (security fix).
- Logs mask customer emails and phone numbers.

### Fixed

- Login links could be crafted to send people to another website after signing in.
- Rate limits could be dodged by faking a header.
- Review and return photos must now be uploaded through the store (not linked from elsewhere).

## Week 3 — Phase 22: Customer support — 2026-11-04

### Added

- **Help centre** at `/help`: searchable questions and answers, managed in Admin → FAQs.
- **Support requests:** customers write from their account or an order's new **Get help** button, attach up to two photos/PDFs, follow the conversation and mark it solved. Replies arrive by email.
- **Admin → Support:** inbox with filters, customers waiting over 24 h highlighted first, assignment, saved replies, internal notes, resolve / reopen.
- Order page shortcuts: Track parcel, Download invoice, Cancel, Return, Get help.
- Optional "Chat on WhatsApp" button (`config.ini` → `[support] whatsapp_number`).
- Support role can now answer tickets and edit FAQs; Order managers can answer tickets.

## Week 3 — Phase 21: Staff roles and permissions — 2026-11-03

### Added

- Staff roles: **Owner, Manager, Catalog editor, Order manager, Support**, each with its own permissions; the admin menu shows only what someone may use.
- **Admin → Staff:** invite by email (link also shown), change roles, deactivate / reactivate, reset someone's two-step sign-in. There is always at least one active owner.
- **Two-step sign-in** with an authenticator app for every staff member, with one-time recovery codes; `npm run staff:reset-2fa` for emergencies.
- Every admin change and every refused attempt is written to the activity log.

### Changed

- Existing admins became Owners (same access as before). Revenue on the dashboard is shown only to staff who can see reports.
- After two-step sign-in you return to the admin page you asked for.

## Week 3 — Phase 20: Abandoned cart and marketing — 2026-11-03

### Added

- **Cart reminders** to signed-in customers after 1 hour and 24 hours (optional single-use coupon in the second). Stop as soon as they order or unsubscribe.
- **Newsletter** sign-up in the footer with double opt-in; consent saved with time and wording. Every marketing email has an unsubscribe link (and one-click unsubscribe in Gmail/Outlook).
- **"Notify me"** on sold-out pieces and sizes; one email when it's back.
- **Referrals:** each customer's link on their account page; a reward coupon after a friend's first delivered order; self-referrals (shared phone number) are voided.
- **Admin → Marketing:** subscribers, reminders and recovered orders, back-in-stock, referrals and coupon use.
- Personal coupons that only their owner can use.

## Week 3 — Phase 19: Background jobs — 2026-11-03

### Added

- Background job queue in the existing database (no new service): emails, SMS, invoices, Shiprocket shipments, payment/courier webhooks, low-stock email and expired stock holds run in the background and are retried automatically.
- **Admin → Jobs:** failed jobs with their last error and a retry button.
- `/api/cron/jobs` — run every 10 minutes by the GitHub schedule (`cron.yml` now calls it).

### Changed

- Paying (online or COD) no longer waits for the confirmation email or invoice; they follow a moment later.
- Webhooks are saved and acknowledged at once; a repeated delivery is ignored.
- "Create shipment" retries on its own if Shiprocket fails, and can't create two parcels on a double click.

## Week 3 — Phase 18: Cash on delivery and payment options — 2026-11-03

### Added

- **Cash on delivery** at checkout, with rules in `config.ini` `[cod]`: maximum order value (₹10,000 by default), optional fee, pincode list, and a block after 2 refused parcels. The reason is shown when COD isn't available.
- SMS one-time code before every COD order (MSG91; hidden in production until the DLT template is approved).
- COD orders are **Confirmed (cash on delivery)**: stock is taken, the invoice says "Cash on delivery", Shiprocket gets a COD shipment for exactly the order total.
- **Admin → Cash on delivery:** delivered orders waiting for the courier's remittance; record cash for several orders at once. COD refunds are marked as paid by bank/UPI with a reference.
- Refused parcels (RTO) are cancelled and restocked automatically and counted against the customer.
- Reports: "How customers paid" (UPI, card, netbanking, EMI, wallet, COD).

### Fixed

- Admin "Cancel" on an order whose stock was already taken would not have put the stock back (now goes through the cancel service).

## Week 3 — Phase 17: Product variants — 2026-11-03

### Added

- Product options (up to 3, e.g. Ring size, Metal colour) and variants with their own SKU, price, stock, weight and optional colour/purity. Admin → product → **Variants**: generate every combination, bulk edit SKU/price/stock/weight, switch variants on/off.
- Size/colour picker on the product page; price, weight, SKU and stock follow the choice.
- Cart lines, stock holds, orders, invoices, emails, Shiprocket lines, returns and restocks are per variant; order lines keep the SKU and variant name.
- Demo product "Plain Gold Band" (3 sizes × 2 colours) in the seed.

### Changed

- Every existing product now has one base variant (migration, no data lost). Listing prices are "from" prices for products with options.
- Stock can no longer be set below the units held in checkouts at that moment.

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
