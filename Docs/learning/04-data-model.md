# 04 — Data model

Source of truth: `prisma/schema.prisma` (well commented — read it). Browse real rows with `npm run db:studio`.

## Conventions (break these and you get bugs)

| Rule                                                                                                                                                       | Why                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Money is an **integer in paise** (`priceInPaise`, `totalInPaise`, …). ₹1,299.50 = `129950`.                                                                | No floating-point rounding errors. Convert only for display (`lib/format.ts` → `formatINR`).                  |
| Weight is an **integer in milligrams** (`grossWeightMg`, `netWeightMg`).                                                                                   | Same reason.                                                                                                  |
| GST rate is in **basis points** (`gstRateBps`: 300 = 3%).                                                                                                  | Integer maths.                                                                                                |
| Rating average is stored ×100 (`ratingAvgX100`: 425 = 4.25★).                                                                                              | Integer sorting/filtering.                                                                                    |
| Orders keep **snapshots** (`addressSnapshot`, `OrderItem.productName/priceInPaise/size/productSnapshot` incl. `pricingMode`, `Invoice` seller/buyer data). | Editing a product, a gold rate, an address or `config/*.ini` later must never change a past order or invoice. |
| "No size" is the empty string `""`, never NULL (`CartItem.size`, `OrderItem.size`).                                                                        | NULLs would defeat the unique key `(cartId, productId, size)`.                                                |
| Metal rates are **paise per gram** (`MetalRate.ratePerGramInPaise`: ₹7,250/g = `725000`).                                                                  | Integer maths; `lib/metal-pricing.ts` multiplies by `netWeightMg / 1000`.                                     |
| IDs are `cuid()` strings.                                                                                                                                  | Not guessable.                                                                                                |

## Tables by area

```
User ─┬─ Account / Session (Auth.js)
      ├─ Address
      ├─ Cart ── CartItem (one per product + size) ──► Product ──► Category
      ├─ WishlistItem ──────► Product
      ├─ Review ────────────► Product
      ├─ VisitRequest ──────► Product (optional; guests too)
      ├─ MetalRate          (setBy: the admin who saved it)
      └─ Order ─┬─ OrderItem ──► Product
                ├─ Payment        (Razorpay order/payment ids, rawPayload; "extra:" rows = payments that didn't pay the order)
                ├─ Invoice        (frozen tax invoice; InvoiceCounter gives numbers)
                ├─ Shipment ── ShipmentEvent  (AWB, label, tracking timeline)
                ├─ ReturnRequest ── ReturnItem
                ├─ Refund         (per refund sent to Razorpay)
                └─ CouponRedemption ──► Coupon
AuditLog      (who changed what in admin)
FunnelDaily   (view → cart → checkout → purchase counters per day)
AppSetting    (small key/value: Shiprocket token, "low-stock email sent today" markers,
               "storefront" = showroom address/hours/phone/WhatsApp/map from Admin → Settings)
MetalRate     (rate history; newest row per purity = today's rate)
```

| Table            | Key fields to check when debugging                                                                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**      | `isActive`, `stock`, `reservedStock` (available = stock − reservedStock, shared by all sizes), `priceInPaise`, `pricingMode` (FIXED / RATE_LINKED), `makingChargeInPaise`, `stoneChargeInPaise`, `netWeightMg`, `occasions[]`, `sizes[]`, `spinVideoUrl`, `previousSlugs[]` (old URL names → 308), `searchText`, `hsnCode`, `gstRateBps`, `isReturnable` |
| **CartItem**     | `productId`, `size` (`""` = none), `quantity`; unique `(cartId, productId, size)`                                                                                                                                                                                                                                                                        |
| **MetalRate**    | `purity`, `ratePerGramInPaise`, `createdAt`, `setById`. Rows are never edited; a new rate is a new row                                                                                                                                                                                                                                                   |
| **VisitRequest** | `name`, `phone` (10 digits), `email`, `preferredDate` (date only, India calendar day), `timeSlot`, `message`, `productId`, `status`, `adminNote`                                                                                                                                                                                                         |
| **Order**        | `status`, `reservationState` + `reservedUntil`, `checkoutKey`, `paidAt`, `totalInPaise`, `discountInPaise`, `refundedInPaise`, `cancellationReason`, `expiredAt`                                                                                                                                                                                         |
| **OrderItem**    | `priceInPaise` snapshot, `size`, `discountInPaise`, `taxableValueInPaise`, `cgstInPaise`/`sgstInPaise`/`igstInPaise`, `quantity`, `returnedQuantity`, `productSnapshot.pricingMode`                                                                                                                                                                      |
| **Payment**      | `providerOrderId` (Razorpay `order_…`, or `extra:<pay_…>` for an extra payment being refunded), `providerPaymentId` (`pay_…`, unique), `status`, `amountInPaise`, `failureReason`, `rawPayload`                                                                                                                                                          |
| **Refund**       | `status`, `razorpayRefundId`, `amountInPaise`, `failureReason` (`"Sending to Razorpay…"` = claimed by a sender right now), `processedAt`, `updatedAt` (PENDING + no Razorpay id + 10 min old = stuck)                                                                                                                                                    |
| **Shipment**     | `status`, `awb`, `courier`, `labelUrl`, `lastError`, `rawPayload`                                                                                                                                                                                                                                                                                        |
| **Coupon**       | type, value, min order, max discount, dates, total/per-user limits, `isActive`                                                                                                                                                                                                                                                                           |

## Status enums

| Enum                                                                              | Values                                                                                           | Rules in                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `OrderStatus`                                                                     | PENDING, PAID, SHIPPED, DELIVERED, CANCELLED, FAILED, RETURN_REQUESTED, REFUND_PENDING, REFUNDED | `lib/order-status.ts`                                    |
| `ReservationState`                                                                | NONE, ACTIVE, CONVERTED, RELEASED                                                                | `services/inventory.service.ts`                          |
| `PricingMode`                                                                     | FIXED, RATE_LINKED                                                                               | `services/metal-rate.service.ts`, `lib/metal-pricing.ts` |
| `Occasion`                                                                        | BRIDAL, FESTIVE, DAILY_WEAR, OFFICE, GIFTING, PARTY (URL form `daily-wear`)                      | `lib/storefront.ts`                                      |
| `VisitStatus`                                                                     | NEW, CONFIRMED, COMPLETED, CANCELLED                                                             | `services/visit.service.ts`                              |
| `PaymentStatus`, `RefundStatus`, `ShipmentStatus`, `ReturnStatus`, `ReviewStatus` | see schema                                                                                       | the matching service                                     |

## Changing the schema safely

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate -- --name short_description` (creates `prisma/migrations/<timestamp>_short_description/` and applies it locally).
3. Read the generated SQL. Prefer **additive** changes (new nullable column / column with default) so the previous deployment keeps working during rollout.
4. Commit the migration folder with the code. Vercel runs `prisma migrate deploy` on **production** deploys only (`scripts/vercel-build.mjs`; previews only with `RUN_MIGRATIONS=1`). CI fails if `schema.prisma` and the migrations don't match ("Migrations match schema.prisma" step).
5. Never edit a migration that is already applied in production — add a new one.

> History note: Phases 14–16 (reviews, search, audit log) were added to the schema without a migration. That gap was fixed by `20261011120000_phase14_16_reviews_search_audit`, written to be safe on databases that already have those tables.

> Latest migration: `20261118120000_storefront_rates_occasions_sizes_visits` — `MetalRate`, `VisitRequest`, the `PricingMode`/`Occasion`/`VisitStatus` enums, the new Product columns, `CartItem.size`/`OrderItem.size` (cart unique key now includes size) and indexes on `Order.couponId`, `Refund.paymentId`, `Product(isActive, netWeightMg)`, `Product(pricingMode, purity)`.
