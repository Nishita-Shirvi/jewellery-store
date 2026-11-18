# Backlog

Known work that is **not done yet**, with why it matters and roughly what the fix is. Most items
came from the full code review in PR #26 (18 Nov 2026); each was checked against the code.

Priority: **P1** fix before real traffic · **P2** fix soon · **P3** nice to have.

When you finish an item, delete it here and mention it in `CHANGELOG.md`.

## Reports and admin

| Pri | Item                                   | Why it matters                                                                                                                                                                                          | Suggested fix                                                                                                                                        |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2  | Reports count refunded orders as sales | `PAID_STATUSES` includes `REFUND_PENDING` / `REFUNDED`, so "Orders", average order value and top products include refunded and returned items. Refunds are grouped by `processedAt`, sales by `paidAt`. | Leave fully refunded orders out of counts and average order value; subtract `returnedQuantity` in top products; label refunds "processed in period". |
| P2  | Dashboard and reports disagree         | Dashboard counts only `PAID/SHIPPED/DELIVERED` and uses raw `stock` for low stock; reports use `stock − reservedStock`.                                                                                 | One shared helper for "sales" and "available stock".                                                                                                 |
| P2  | Orders CSV doesn't match the report    | Export filters by `createdAt` and includes unpaid cancelled holds; stops at 20,000 rows without saying so.                                                                                              | Filter by `paidAt` + paid statuses; show a warning when the row cap is hit.                                                                          |
| P2  | Review queue capped at 100             | `listReviewsAdmin` takes 100 newest; older pending reviews can never be moderated.                                                                                                                      | Paginate with `Pager`; show oldest pending first.                                                                                                    |
| P3  | Product list tools                     | Search by name only; no category filter, sort, HUID search, bulk hide/feature/price, CSV import/export or "duplicate product".                                                                          | Add filters first, then bulk actions.                                                                                                                |
| P3  | Featured order and category content    | Featured pieces sort by newest only; categories have no image/description fields in admin; collection intro text is hard-coded in `app/collections/[slug]/page.tsx`.                                    | `featuredOrder` column; category form fields; move intro text to the category.                                                                       |
| P3  | Draft products and preview             | New products are live by default; hidden products can't be previewed in the store.                                                                                                                      | Admin-only preview route for hidden products.                                                                                                        |
| P3  | Mark shipment cancelled by hand        | After cancelling a parcel at the courier, the order can only be cancelled once a courier "cancelled" update arrives.                                                                                    | Admin button "Shipment cancelled at courier" (audited).                                                                                              |

## Accounts and security

| Pri | Item                                | Why it matters                                                                                                                                       | Suggested fix                                                                          |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P1  | Rate limits are per server instance | `lib/rate-limit.ts` keeps counters in memory; on Vercel every instance has its own, so login/visit/review limits multiply.                           | Move to Upstash Redis (Goal.md Phase 19).                                              |
| P2  | No email verification at sign-up    | Anyone can register someone else's email; the real owner then can't use "Sign in with Google" for it. Register also reveals whether an email exists. | Verify email before activating; then allow linking verified accounts; generic message. |
| P2  | Sessions can't be revoked           | JWT sessions last 30 days; a stolen cookie or a blocked customer keeps working (admin role is re-checked, customer actions aren't).                  | Shorter `maxAge` + `updateAge`, and a `tokenVersion` check in the `jwt` callback.      |
| P3  | Content-Security-Policy             | Only basic security headers are set today.                                                                                                           | Full CSP (Goal.md Phase 23), allowing Razorpay, GA, Cloudinary/R2.                     |

## Payments, refunds and invoices

| Pri | Item                               | Why it matters                                                                                                                                      | Suggested fix                                                                                             |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| P1  | Confirm Razorpay auto-capture      | The checkout callback marks an order paid on the signed authorisation. If auto-capture is off, Razorpay releases the money after a few days.        | Check Razorpay → Settings → Payment capture = Automatic (in GO_LIVE_CHECKLIST), or verify status via API. |
| P2  | Missed invoices aren't backfilled  | The invoice is created after the payment commits; if that fails (timeout) the order has no invoice until an admin clicks Generate.                  | Cron: create invoices for paid orders without one, dated and numbered correctly.                          |
| P2  | Refund marker fields               | Refund claims use a `failureReason` marker and extra payments a `providerOrderId = "extra:…"` prefix (no schema change was allowed in PR #26).      | Add `RefundStatus.SENDING`, `attempt`, `claimedAt`, and `Payment.kind` (ORDER / EXTRA); migrate.          |
| P3  | Extra-payment refund email wording | A refunded duplicate payment sends the normal "refund processed" order email.                                                                       | Separate email text for "duplicate payment refunded".                                                     |
| P3  | Split-return rounding              | Per-unit `Math.round` can over-refund 1 paisa per split return; a full "changed my mind" return leaves the order DELIVERED (shipping not refunded). | Refund the last unit of a line as the remainder; decide final status by "all items returned".             |

## Catalogue and pricing

| Pri | Item                                     | Why it matters                                                                           | Suggested fix                                                                |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P2  | Automatic gold-rate feed                 | Rates are typed in by an admin every day.                                                | Server-side provider adapter + daily cron writing `MetalRate` (keys in env). |
| P2  | Per-size stock                           | Stock is shared across sizes (assumes workshop resizing).                                | Optional per-size stock table if the shop holds ready sizes.                 |
| P3  | Search does a full-table check per query | Every search counts products with empty `searchText` and may reindex inside the request. | Drop the per-search check now that create/update reindex the product.        |
| P3  | Seed data has no occasions or sizes      | New dev databases show empty "Shop by occasion" tiles.                                   | Add occasions/sizes to `prisma/seed-data/catalog.ts`.                        |
| P3  | Image alt text                           | Product photos use the product name only; no per-image alt text.                         | Optional alt text per image in the product form.                             |
| P3  | Mobile filters                           | On phones the full filter form sits above the products.                                  | Collapsible filter panel (`<details>`) on small screens.                     |
| P3  | Virtual try-on, 3D viewer, photo search  | Seen in the demo site; heavy and only worth it with real 3D scans / a larger catalogue.  | Revisit after launch.                                                        |

## Images (Cloudflare R2)

| Pri | Item                          | Why it matters                                                                                                                                     | Suggested fix                                                                            |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| P2  | Move existing photos to R2    | After switching `[images] provider = r2`, old photos are still served from Cloudinary (admins can keep saving them), so both services stay in use. | One-off script: copy each Cloudinary image to R2 and rewrite product/review/return URLs. |
| P3  | Upload 360° videos from admin | The video field takes a link; videos are uploaded to Cloudinary/R2 by hand.                                                                        | Video upload in the product form (size limit, mp4/webm sniffing).                        |

## Platform and testing

| Pri | Item                                | Why it matters                                                                                 | Suggested fix                                                        |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| P2  | Webhook and cron routes untested    | Only their helpers have tests; route-level signature/auth handling isn't covered.              | Route tests for Razorpay webhook, courier webhook and cron auth.     |
| P3  | Sentry navigation hook              | Start-up warns that `onRouterTransitionStart` isn't exported from `instrumentation-client.ts`. | Export `Sentry.captureRouterTransitionStart`.                        |
| P3  | `package.json#prisma` is deprecated | Prisma 7 needs `prisma.config.ts`.                                                             | Move the seed setting to `prisma.config.ts` before upgrading Prisma. |

## Code quality (from the PR #26 code review)

Not bugs today, but places where two copies of one rule can drift apart.

| Pri | Item                                         | Why it matters                                                                                                                                                  | Suggested fix                                                                    |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P3  | Old-slug lookup is uncached                  | `findRenamedProductSlug` runs an uncached `previousSlugs has` query (no GIN index) on every unknown `/products/<slug>`; bots can make many.                     | Wrap in `unstable_cache` with `CATALOG_TAG`; add a GIN index on `previousSlugs`. |
| P3  | Retry-refund rule copied into the admin page | `app/admin/orders/[id]/page.tsx` hard-codes the 10-minute rule instead of calling `canRetryRefund` / `STUCK_REFUND_MS`.                                         | Call `canRetryRefund(r)` from `refund.service`.                                  |
| P3  | Large-rate-change check written twice        | `saveRates` has its own copy; `isLargeRateChange` in `lib/metal-pricing.ts` is only used by tests.                                                              | Call `isLargeRateChange(old, new, limitBps)` in `saveRates`.                     |
| P3  | "Sizes share stock" rule written four times  | Cart add/update, `priceCart`, guest-cart merge and checkout each total quantities per piece their own way.                                                      | One helper that totals quantity per `productId`, used everywhere.                |
| P3  | Small duplicates in admin code               | `typed()` in `app/admin/storefront-actions.ts` copies `typedValues()`; the occasion list is repeated in `lib/validation/admin.ts` instead of using `OCCASIONS`. | Share the helper; use `OCCASIONS`.                                               |
