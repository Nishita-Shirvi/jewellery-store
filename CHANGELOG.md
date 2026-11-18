# Changelog

## Storefront: gold rates, occasions, sizes, visits — 2026-11-18

Needs the migration `20261118120000_storefront_rates_occasions_sizes_visits` (applied automatically on production deploys). After deploying: enter today's rates and the showroom details in admin — see `Docs/GO_LIVE_CHECKLIST.md` and `Docs/ADMIN_GUIDE.md`.

### Added

- **Gold-rate pricing:** Admin → **Gold rates** stores today's rate per gram (24K, 22K, 18K, 14K, 925 silver, PT950, with history). Products can be **fixed price** or **follow today's metal rate**: (net weight × rate + making + stone charge) + GST, rounded to the rupee, recalculated for every rate-linked piece in one transaction when rates are saved. Changes above 15% need a confirmation tick. Rate bar above the header, price breakup on the product page, dashboard warning when rates are older than 36 hours, `pricingMode` kept in the order snapshot.
- **Occasions:** tag products Bridal / Festive / Daily wear / Office wear / Gifting / Party; occasion, colour and net-weight filters; budget chips; "Shop by occasion" on the home page; `/style-advisor` quiz that opens the matching filtered list.
- **Sizes:** per-product size list (rings, bangles), size picker before Add to cart, one cart line per product + size with stock shared across sizes, size on orders, emails and admin; `/size-guide`; wishlist "Choose size".
- **WhatsApp and showroom visits:** "Ask on WhatsApp" button; `/visit` booking form with email alert to the shop and Admin → **Visits**; Admin → **Settings** for showroom address, hours, phone, WhatsApp and map link (shown on the contact page).
- **Products:** 360° video link, photo reordering, delete for never-ordered pieces, old URL names redirect (308) after a rename, "Follows metal rate" filter in admin.
- **Home page:** featured count and customer reviews section, both set in `config/storefront.ini`.
- **Cloudflare R2** as an alternative image store (`[images] provider = cloudinary | r2 | none`); uploads signed server-side with SigV4, no SDK.
- `Docs/ADMIN_GUIDE.md` — plain-language guide for the shop team.
- CI step "Migrations match schema.prisma".

### Changed

- `config.ini` split into a `config/` folder (business, shipping + returns, pricing, storefront, inventory + alerts, images, features + logging). Same section/key names and env overrides; a section defined in two files is an error; a trailing ` ; comment` after a value is stripped. Copy any values you edited in `config.ini` before deploying.
- Return window is now `[returns] window_days` (was fixed at 7 in code); `0` turns returns off.
- `vercel-build` runs `prisma migrate deploy` only on production deployments (or previews with `RUN_MIGRATIONS=1` and their own database) — `scripts/vercel-build.mjs`.
- Production refuses to start without an `https://` `NEXT_PUBLIC_APP_URL`, a `CRON_SECRET`, or with a test-only `*_API_BASE` override set.
- Seed is create-only (never overwrites edited products/categories) and refuses to run against production unless `SEED_ALLOW_PROD=1`.
- Paid orders can't be cancelled (by customer **or** admin) once a courier shipment exists; cancel it in Shiprocket first.
- Invoices are not created while business details are still placeholders, and reuse the GST split stored at checkout.
- Saved image and video links must come from our own Cloudinary cloud or R2 bucket (products, reviews, returns).
- Category edits keep the URL name when left blank; product edits keep the stock unless it was changed.
- Logger replaces values nested deeper than 4 levels with `[truncated]`.
- New indexes: `Order.couponId`, `Refund.paymentId`, `Product(isActive, netWeightMg)`, `Product(pricingMode, purity)`.

### Fixed

- **Open redirect** after login (paths containing tabs, newlines or backslashes could send users to another site).
- **Login limit per account** (20 attempts / 15 min from any IP) on top of the per-IP and per-email+IP limits.
- Payment-failed page no longer prints text from the URL.
- A captured payment for a cancelled order, or a second payment for a paid order, is now **refunded automatically** instead of being kept silently.
- Sold-out-after-payment: order status, payment and refund row are saved in one transaction, so a crash can't leave a cancelled order with no refund. Stuck unsent refunds are sent by the cron job and can be retried by the admin.
- Refund retries are claimed before calling Razorpay, so two retries at once can't both send money.
- Stock-hold race: a payment arriving just as the hold expired could consume another customer's held stock.
- A shipment created at the same moment as a cancellation is detected instead of shipping a refunded order.
- Editing a product no longer overwrites stock sold while the form was open, or a category's URL name/description.

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
