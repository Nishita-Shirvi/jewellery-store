# Backlog

Things still to do. Nothing here is broken today.

## Needs Vineet (before going live)

**BL-4 · Encryption key** (added 4 Nov)
Customer addresses and phone numbers are stored encrypted. Before deploying:

1. Create a key: `openssl rand -base64 48`
2. Put it in Vercel as `PII_ENCRYPTION_KEY`, and keep a copy in a password manager. Without it, saved addresses can't be read.
3. After deploying, run `npm run pii:encrypt` once on the live database. Running `npm run pii:encrypt -- --dry` afterwards should show zeros.

**BL-5 · Legal text and business details** (added 4 Nov)

- A lawyer or CA should read the privacy policy and terms.
- Fill in the business and grievance officer details in `config/business.ini` (sections `[business]` and `[grievance_officer]`). They appear on product pages, policies and invoices.

**BL-6 · Zoho Books / Tally** (added 5 Nov)
Today the shop gives a monthly sales register to import by hand. An automatic sync needs either a Zoho Books account (API details) or a Tally connector on the office PC. Decide which one you use, then share access.

**BL-7 · Backup restore test on the live database** (added 5 Nov)
The restore test has only been run on a test copy (it passed in 3 seconds). Run it once on production:
`npm run backup:drill -- --target "<empty Neon branch address>"`
Then write the result in `Docs/BACKUPS.md`.

**BL-12 · Razorpay auto-capture** (added 19 Nov)
The checkout marks an order paid on Razorpay's signed authorisation. If auto-capture is off, Razorpay releases the money after a few days. Check Razorpay → Settings → Payment capture = **Automatic** (also in `GO_LIVE_CHECKLIST.md`).

## After the final design

**BL-8 · Hindi.** All customer text in Hindi too, with a language switch. Needs the final wording and a translator.

**BL-9 · Dark mode.** Best done together with the final colours.

**BL-10 · Instant cart.** The cart count updates about 0.2 seconds after a click. Making it instant is worth doing with the final header design.

## Planned upgrades

**BL-11 · Next.js 16, Prisma 7, ESLint 10** (added 6 Nov)
Big version jumps that Dependabot suggested (PRs #5, #6, #8). Each needs code changes, so they were closed for now:

- Prisma 7 needs a new config file and database adapter (decision D-09).
- eslint-config-next 16 only works with Next.js 16.
- ESLint 10 isn't supported yet by the TypeScript lint plugins.

Best done together, on their own branch, with the full test run, when there's a quiet week. Dependabot is set to stop suggesting these big jumps (it still sends safe small updates).

**BL-13 · Automatic gold-rate feed** (added 19 Nov)
Rates are typed in by an admin every morning.
Fix: a server-side provider adapter and a daily cron that writes `MetalRate` (keys in env).

**BL-14 · Move existing photos to R2** (added 19 Nov)
After switching `[images] provider = r2`, old photos are still served from Cloudinary (admins can keep saving them), so both services stay in use.
Fix: a one-off script that copies each Cloudinary image to R2 and rewrites product, review and return links.

**BL-15 · Upload 360° videos from admin** (added 19 Nov)
The video field takes a link; videos are uploaded to Cloudinary/R2 by hand.
Fix: video upload in the product form (size limit, mp4/webm check).

**BL-16 · Shared rate limits** (added 19 Nov)
`lib/rate-limit.ts` keeps counters in memory. On Vercel every instance has its own, so login, visit-booking and review limits multiply with traffic.
Fix: move to Upstash Redis.

**BL-17 · Email check at sign-up** (added 19 Nov)
Anyone can register someone else's email; the real owner then can't use "Continue with Google" for it. Register also says whether an email already exists.
Fix: verify the email before activating; then allow linking verified accounts; show a generic message.

**BL-18 · Virtual try-on, 3D viewer, photo search** (added 19 Nov)
Seen on demo sites; heavy, and only worth it with real 3D scans and a larger catalogue. Revisit after launch.

## Small fixes found in code review

**BL-1 · "Shown" counts for recommendations can be a little low.**
Counts are saved every few seconds, so the last few seconds can be lost if a server restarts. Clicks and purchases are always exact.
Fix: save as soon as nothing else is being saved.

**BL-2 · Cash-on-delivery sales show late in the recommendations report.**
A COD order counts only after the cash is recorded.
Fix: also count confirmed COD orders, shown separately.

**BL-3 · The homepage loads its product rows one after another.**
Fine with 1–3 rows; slower with many.
Fix: load them all at once.

### From the storefront release review (19 Nov)

**BL-19 · A sale during a variant-grid edit can be undone.**
The product form and the quick stock box send the stock shown when the page opened and refuse the save if a sale changed it. The variant grid (Products → Variants) has no such check, so saving it can overwrite a sale that happened while it was open.
Fix: send each variant's original stock and refuse the save on a mismatch, like the product form does.

**BL-20 · The weight filter uses the main weight only.**
The catalogue's net-weight filter compares the product's main weight, not each size's weight, so a size that fits the range can be missed (or the other way round).
Fix: filter on variant weights.

**BL-21 · Old product links are looked up without a cache or index.**
`findRenamedProductSlug` runs an uncached `previousSlugs has` query on every unknown `/products/<slug>` (bots can send many), and `uniqueSlug` runs it up to 99 times per save.
Fix: wrap it in `unstable_cache` with the catalogue tag and add a GIN index on `previousSlugs`.

**BL-22 · The large-rate-change check is written twice.**
`isLargeRateChange` in `lib/metal-pricing.ts` is only used by tests; `saveRates` in `services/metal-rate.service.ts` has its own copy.
Fix: call `isLargeRateChange` from `saveRates`.

**BL-23 · Reports count refunded orders as sales.**
Order counts, average order value and top products include returned and refunded orders. Refunds are grouped by when they were processed, sales by when they were paid.
Fix: leave fully refunded orders out; subtract returned quantities in top products; label refunds "processed in period".

**BL-24 · Dashboard and reports disagree.**
The dashboard counts fewer statuses as sales and uses total stock for "low stock"; reports use stock minus held stock.
Fix: one shared helper for "sales" and "available stock".

**BL-25 · Orders CSV doesn't match the report.**
The export filters by order date and includes unpaid cancelled holds; it stops at 20,000 rows without saying so.
Fix: filter by paid date and paid statuses; warn when the row cap is hit.

**BL-26 · Review queue shows only 100.**
`listReviewsAdmin` takes the 100 newest, so older pending reviews can't be reached.
Fix: paginate; show oldest pending first.

**BL-27 · Product list tools.**
Admin search is by name only; no category filter, sort, HUID search, bulk hide/feature or "duplicate product". (CSV import/export exists in Admin → Accounting.)
Fix: add filters first, then bulk actions.

**BL-28 · Featured order and category content.**
Featured pieces sort by newest only; the category form has no image or description fields.
Fix: a `featuredOrder` column; category form fields.

**BL-29 · Preview hidden products.**
Hidden products can't be previewed in the store.
Fix: an admin-only preview route.

**BL-30 · Mark a shipment cancelled by hand.**
After cancelling a parcel at the courier, the order can only be cancelled once the courier's "cancelled" update arrives.
Fix: an audited admin button "Shipment cancelled at courier".

**BL-31 · Refund marker fields.**
Refund claims use a `failureReason` marker, and extra payments a `providerOrderId = "extra:…"` prefix, instead of real columns.
Fix: add a "sending" refund status, `attempt`, `claimedAt` and `Payment.kind` (order / extra); migrate.

**BL-32 · Duplicate-payment refund email.**
A refunded duplicate payment sends the normal "refund processed" order email.
Fix: separate wording for "duplicate payment refunded".

**BL-33 · Split-return rounding.**
Rounding per unit can over-refund 1 paisa per split return; a full "changed my mind" return leaves the order Delivered (shipping not refunded).
Fix: refund the last unit of a line as the remainder; decide the final status by "all items returned".

**BL-34 · Search checks the whole table on every query.**
Every search counts products with an empty search index and may reindex inside the request.
Fix: drop the per-search check now that saving a product reindexes it.

**BL-35 · Image alt text.**
Product photos use the product name as alt text.
Fix: optional alt text per photo in the product form.

**BL-36 · Mobile filters.**
On phones the full filter form sits above the products.
Fix: a collapsible filter panel on small screens.

**BL-37 · Webhook and cron routes untested.**
Only their helpers have tests; route-level signature and auth handling isn't covered.
Fix: route tests for the Razorpay webhook, courier webhook and cron auth.

**BL-38 · Sentry navigation hook.**
Start-up warns that `onRouterTransitionStart` isn't exported from `instrumentation-client.ts`.
Fix: export `Sentry.captureRouterTransitionStart`.

**BL-39 · Invoices for orders paid while business details were placeholders.**
Until `config/business.ini` is filled in, paid orders get no invoice (no number is used up) and the admin presses "Generate invoice" on each later.
Fix: a daily job that creates the missing invoices once the details are real — after confirming with the CA which invoice date to use for late invoices, and skipping orders refunded or cancelled meanwhile.

**BL-40 · Reading current rates loads the whole rate history.**
`readCurrentRates` uses Prisma `distinct`, which fetches every MetalRate row and de-duplicates in Node. Every save adds rows, and it runs once per product while repricing.
Fix: one `findFirst` per purity (uses the `[purity, createdAt]` index) or a raw `DISTINCT ON`.

**BL-41 · "Reprice now" count loads every rate-linked product.**
`productsNeedingReprice` loads all rate-linked products and sizes on every rates-page view, just to count them.
Fix: compare in SQL, or store a "repriced at" time per product and compare with the newest rate.

**BL-42 · Per-account login limit can lock the owner out.**
20 wrong passwords for an email (from any IPs) block that account for 15 minutes, including staff. Someone could keep the owner out of the admin.
Fix: on the account limit, ask for an emailed code (or CAPTCHA) instead of refusing; log the targeted account; consider exempting staff who pass two-step sign-in.

**BL-43 · Payment for an order whose hold is already "converted" errors instead of refunding.**
`convertReservation` throws a plain error when an order that is about to be paid is already marked CONVERTED (only possible after a manual database fix). The webhook then fails and retries.
Fix: treat it like "sold out" (record and refund) and log it for a person to check.

**BL-44 · Visit requests wait for every admin email.**
The visit form sends the alert emails one after another before answering the shopper.
Fix: queue the alert as a background job (like order emails).

When something here is fixed, delete it and mention it in `CHANGELOG.md`.
