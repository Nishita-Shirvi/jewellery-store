# Changelog

## New shop look, dark mode and festival themes — 2026-11-21

Needs the migration `20261121090000_category_tile` (adds `Category.tile`; applied automatically on production deploys). Customer pages only; admin keeps its look.

### Added

- **New look** for every customer page: Cormorant Garamond headings and Karla text (self-hosted), a wordmark header with a categories row, rate bar under the header, product cards with gold prices ("BIS hallmarked" only on pieces with an HUID) and a four-column footer with the showroom address from Admin → Showroom.
- **Dark mode** with a sun/moon button in the header, remembered per shopper (cookie `vj_mode`); otherwise the shop follows the device, or the default set in Admin → Appearance.
- **Admin → Appearance** (needs `content.manage`): festival themes with dates (India time), seven colours with **Default colours**, festive decoration (toran or petals), the top of the home page (photo in an arch or a full-width background video) and an offer line. Preview links for staff. See `Docs/ADMIN_GUIDE.md` → Appearance.
- **Home page** in the new layout: trust bar, category tiles, the wedding and festive edits with every occasion, featured pieces, the style advisor band, reviews and a "Prefer to see it in person?" band with Book a visit and WhatsApp.
- **Category tiles on a display model** (velvet bust, head or hand, in the theme colours): the hover (or tap) zoom grows the product photo out of where the piece sits. Admin → Categories → **Home-page tile**: upload a product photo, its background is removed in the browser (no paid service), then drag, size and turn it on the model; or use your own model photo. Sample tiles from stock photos (`public/images/tiles/`) show until then.
- Videos upload straight from the browser to Cloudinary with a signed ticket (MP4/WebM only, `[images] max_video_mb`, default 25). The CSP now allows `https://api.cloudinary.com` for this.

### Changed

- The announcement bar highlights words between `*stars*` in gold.
- The built-in home page starts with the live theme's hero instead of the fixed maroon band.

## Storefront: gold rates, occasions, showroom visits — 2026-11-19

Needs the migration `20261119090000_storefront_rates_visits` (applied automatically on production deploys). After deploying: enter today's rates (Admin → Gold rates) and the showroom details (Admin → Showroom) — see `Docs/GO_LIVE_CHECKLIST.md` and `Docs/ADMIN_GUIDE.md`.

### Added

- **Gold and metal rates:** Admin → **Gold rates** stores today's rate per gram (24K, 22K, 18K, 14K, 925 silver, PT950) and keeps the history. Viewing needs `products.view`, saving needs `products.edit`.
- **Rate-linked pricing:** a product is either **fixed price** or **follows today's metal rate**. For rate-linked products every size (variant) is priced from its own net weight: (net weight × rate + making charge + stone charge) + GST, rounded to the rupee. Saving rates reprices every rate-linked variant in one transaction and refreshes the product's "from" price; a sale ("was") price that is no longer above the new price is cleared. Saving a rate-linked product, its options or its variant grid also reprices it.
- Rate changes above `[pricing] large_change_percent` (15%) need a tick-box (catches typing the rate per 10 g). The dashboard warns when rates are older than `[pricing] stale_after_hours` (36). Single-size rate-linked pieces show a price breakup on the product page, only when it adds up exactly to the price charged.
- **Rate strip** at the top of the header: today's rates for `[pricing] strip_purities` plus the standing message `[storefront] announcement`. The scheduled announcement bar (Admin → Content) still shows above it, for time-limited offers.
- **Occasions** as product tags (`bridal`, `festive`, `daily-wear`, `office-wear`, `gift`, `party`, the same tags the starter occasion collections use): catalogue Occasion filter (`/products?occasion=bridal`), "Shop by occasion" tiles on the home page, chips on the product page.
- **Catalogue filters:** occasion, metal colour, net weight range (grams; uses the product's main weight) and budget chips above the listing.
- **Style advisor** at `/style-advisor`: a short form (works without JavaScript) that opens the matching filtered product list.
- **WhatsApp:** one number for every "Chat on WhatsApp" button (product page, contact, visit page, help centre, checkout, support tickets) — the number in Admin → Showroom, else `[support] whatsapp_number`. A bare 10-digit number gets `91` added. Off with `[features] whatsapp_button = false`.
- **Showroom visits:** booking form at `/visit` (date window, spam trap) with an email to the shop, Admin → **Visits** (needs `support.manage`) and new requests on the dashboard. Off with `[features] visit_booking = false`.
- **Admin → Showroom** (`/admin/settings`, needs `content.manage`): showroom address, hours, phone, WhatsApp and map link, changed without a deploy. Legal and GST details stay in `config/business.ini`.
- **Size guide** page (`/size-guide`, ring and bangle sizes), linked from product pages with options and from the footer.
- **Home page** (built-in, when no Admin → Content home sections are live): shop-by-occasion tiles, featured count from `[storefront] featured_count`, recent 4–5 star reviews (`[storefront] home_reviews`) and a "See it before you buy" visit band.
- **360° video** per product (our own Cloudinary/R2 `.mp4` or `.webm`, or a `/videos/...` path), shown in the product gallery and loaded only when chosen.
- **Admin products:** pricing mode and stone charge, 360° video link, photo reordering (← → buttons; the first photo is the main one), delete for pieces never ordered (otherwise hide), renamed products keep their old links (permanent redirect), "Follows metal rate" filter, low-stock threshold from config.
- **Cloudflare R2** as an image store: `[images] provider = cloudinary | r2 | none`, uploads signed on the server (SigV4, no SDK), size limit `[images] max_upload_mb`.
- Admin menu: **Gold rates**, **Visits**, **Showroom**.
- `Docs/ADMIN_GUIDE.md` sections for rates, occasions, variants and visits; `config/README.md`.
- CI step "Migrations match schema.prisma".

### Changed

- **`config.ini` is replaced by the `config/` folder:** `business.ini`, `shipping.ini`, `pricing.ini`, `storefront.ini`, `inventory.ini`, `images.ini`, `features.ini`, `marketing.ini`, `customer.ini`. Same section and key names, and `SECTION_KEY` env overrides still work. A section in two files, or an unknown section or key, stops start-up. Comments only on their own line — text after a value is part of the value. Copy any values you edited in `config.ini` before deploying.
- Return window is `[returns] window_days` (`0` turns returns off).
- Saved image and video links must point at our own Cloudinary cloud or R2 address (`../` tricks are blocked); customer review and return photos must be our own upload in the right folder. Old Cloudinary product photos stay valid after moving to R2.
- The Content-Security-Policy allows video (`media-src`) from Cloudinary and the R2 address.
- **Stock safety:** the product form and the quick stock box send the stock shown when they opened; if a sale changed it meanwhile the save is refused instead of silently undoing the sale.
- Invoices are not created while business details are still placeholders.
- `vercel-build` runs `prisma migrate deploy` only on production (or on previews with `RUN_MIGRATIONS=1` and their own database). Production refuses to start without an `https://` `NEXT_PUBLIC_APP_URL` and a `CRON_SECRET`, or with a test-only `*_API_BASE` override.
- Seed is create-only (never overwrites edited products or categories) and refuses to run against production unless `SEED_ALLOW_PROD=1`.
- Logger replaces values nested deeper than 4 levels with `[truncated]`.
- Database: new migration `20261119090000_storefront_rates_visits` — `PricingMode` and `VisitStatus` enums; `Product.pricingMode`, `stoneChargeInPaise`, `spinVideoUrl`, `previousSlugs`; `MetalRate` and `VisitRequest` tables; new indexes including `Refund(paymentId)`.

### Removed

- The old per-product size list (`Product.sizes`, `CartItem.size`) from the earlier storefront branch: sizes are variants (each with its own SKU, stock, price and weight).

### Fixed

- **Login limit per account** (any IP) on top of the per-IP and per-email limits.
- The payment-failed page no longer prints text from the URL.

### Money, stock and invoice safety fixes

- **GST and sales reports:** refunds of duplicate payments and of orders that were never paid (sold out at payment) are no longer counted as credit notes or as refunds of sales.
- **Saving gold rates scales:** rates are saved first, then each product is repriced in its own short transaction, so any number of pieces fits the database time limit. If repricing stops half-way, the rates page shows how many products are out of date and **Reprice now** finishes it. The stale-rate warning also covers purities used only by one size.
- **"Refunding in full" is only shown when a refund of that payment really exists.** A second payment on an order that was cancelled or refunded after being paid is refunded and the customer is told so (never sent to the success page).
- **Cart and checkout** show the configured return window (and no return promise when returns are off).
- **Customer photos** must be in the right folder in the URL path itself (a folder name in the query string is refused).
- **Rate-linked pieces with sizes** can be saved without a rate for the product's own purity (each size uses its own).
- **Invoices with placeholder business details:** "Generate invoice" now says why it can't, and the dashboard shows a warning.
- **Returns off (`window_days = 0`):** the delivered email and refund policy no longer say "within 0 days".
- **Contact page** shows the WhatsApp number its link uses; WhatsApp numbers typed with a leading 0 or 00 now make a working link; the product audit log records stock only when it was really changed.

- **Extra payment refunded:** a second payment on an order that is already paid or cancelled is recorded on its own and refunded in full (it used to be kept silently). Checkout shows "refunding in full".
- **Sold out at payment, in one step:** the order moves to "refund pending", the hold is released, the payment and the refund are recorded in one transaction; Razorpay is called after. A crash in between can no longer lose the money. A repeated webhook shows "sold out", never "order confirmed".
- **Refunds are sent once:** a refund is claimed before calling Razorpay, so two retries can't both send it. A refund the bank failed is retried with a new reference. A fast webhook is never overwritten. Failed refunds count towards "already refunded".
- **Stuck refunds are sent automatically:** the reservations job also sends Razorpay refunds that never left (e.g. after a crash). The Retry button appears only when a retry is allowed, and never for COD.
- **Stock holds:** marking an order paid switches its hold under the order lock, so a hold released a moment earlier can't take another buyer's stock.
- **No cancel/refund once a courier parcel exists:** cancelling (admin or customer) is refused while a Shiprocket shipment or AWB exists; cancel it in Shiprocket first. Shiprocket ids are saved under the order lock.
- **Return window** comes from config/shipping.ini `[returns] window_days` everywhere, including the delivered email.
- **Invoices:** no invoice number is used while the business details are still `[placeholders]` (the invoice job waits quietly; press "Generate invoice" once they're filled in). CGST/SGST vs IGST comes from the tax split saved at checkout.
- **Seed is safe to re-run:** it never overwrites prices, stock or visibility, and refuses to run against production unless `SEED_ALLOW_PROD=1`.
- **Preview deployments don't migrate the production database** (`scripts/vercel-build.mjs`).

## Week 4 — Phase 27: Privacy and compliance — 2026-11-04

### Added

- **Account → Privacy:** turn offers / cart-reminder emails, order-update SMS and analytics cookies on or off (each choice is recorded), **download my data**, and **delete my account**.
- Sign-up has an optional, unticked "email me offers" box.
- Phone numbers and addresses are **encrypted in the database**; `npm run pii:encrypt` encrypts older rows (and re-encrypts after a key change).
- A daily clean-up deletes data no longer needed (one-time codes, old reset links, old reminder records…); periods in `config/customer.ini` → `[privacy]`.
- Product pages show who sells it (legal name, address, GSTIN), the grievance officer, country of origin, and links to returns and delivery policies.
- Privacy policy and terms describe exactly what the store does, including retention periods.

### Changed

- **Cart reminders and offers are only emailed to customers who opted in** (existing customers start opted out). Unsubscribe links also turn the account's offers off.

## Week 4 — Phase 26: Monitoring and alerts — 2026-11-04

### Added

- **Business alerts** by email (and optional Slack / Google Chat / Discord): payments failing, no orders for a long time, failed background jobs, webhook problems, best-sellers out of stock, many errors. One email when it starts, reminders while it lasts, and a "Resolved" email. A payment outage is detected within seconds.
- **Admin → System:** database, scheduler, background jobs, alert status, integrations and the deployed version; "Run alert checks now".
- **`Docs/RUNBOOK.md`:** what each alert means, what to check, how to fix it.
- **Uptime checks** every 5 minutes (GitHub Actions) on the home page, health, checkout and webhooks, plus a deeper health check for the scheduler and stuck jobs.
- Log lines from one request or job share an id (`requestId`, `jobId`); API responses return it as `x-request-id`. Sentry errors are tagged with the deployed version.

### Changed

- Business alert emails go to `[alerts] admin_email`, else to Owners and Managers only (the low-stock email is unchanged).

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
- **Preview links** for drafts and scheduled items (48 hours); festival quick dates from `config/marketing.ini` `[festivals]`.
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
- Optional "Chat on WhatsApp" button (`config/customer.ini` → `[support] whatsapp_number`).
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

- **Cash on delivery** at checkout, with rules in `config/shipping.ini` `[cod]`: maximum order value (₹10,000 by default), optional fee, pincode list, and a block after 2 refused parcels. The reason is shown when COD isn't available.
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
