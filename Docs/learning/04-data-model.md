# 04 — Data model

Source of truth: `prisma/schema.prisma` (well commented — read it). Browse real rows with `npm run db:studio`.

## Conventions (break these and you get bugs)

| Rule                                                                                                                              | Why                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Money is an **integer in paise** (`priceInPaise`, `totalInPaise`, …). ₹1,299.50 = `129950`.                                       | No floating-point rounding errors. Convert only for display (`lib/format.ts` → `formatINR`). |
| Weight is an **integer in milligrams** (`grossWeightMg`, `netWeightMg`).                                                          | Same reason.                                                                                 |
| GST rate is in **basis points** (`gstRateBps`: 300 = 3%).                                                                         | Integer maths.                                                                               |
| Rating average is stored ×100 (`ratingAvgX100`: 425 = 4.25★).                                                                     | Integer sorting/filtering.                                                                   |
| Orders keep **snapshots** (`addressSnapshot`, `OrderItem.productName/priceInPaise/productSnapshot`, `Invoice` seller/buyer data). | Editing a product, address or `config.ini` later must never change a past order or invoice.  |
| IDs are `cuid()` strings.                                                                                                         | Not guessable.                                                                               |

## Tables by area

```
User ─┬─ Account / Session (Auth.js)
      ├─ Address
      ├─ Cart ── CartItem ──► Product ──► Category
      ├─ WishlistItem ──────► Product
      ├─ Review ────────────► Product
      └─ Order ─┬─ OrderItem ──► Product
                ├─ Payment        (Razorpay order/payment ids, rawPayload)
                ├─ Invoice        (frozen tax invoice; InvoiceCounter gives numbers)
                ├─ Shipment ── ShipmentEvent  (AWB, label, tracking timeline)
                ├─ ReturnRequest ── ReturnItem
                ├─ Refund         (per refund sent to Razorpay)
                └─ CouponRedemption ──► Coupon
AuditLog      (who changed what in admin)
FunnelDaily   (view → cart → checkout → purchase counters per day)
AppSetting    (small key/value: Shiprocket token, "low-stock email sent today" markers)
```

| Table         | Key fields to check when debugging                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product**   | `isActive`, `stock`, `reservedStock` (available = stock − reservedStock), `priceInPaise`, `searchText`, `hsnCode`, `gstRateBps`, `isReturnable`                  |
| **Order**     | `status`, `reservationState` + `reservedUntil`, `checkoutKey`, `paidAt`, `totalInPaise`, `discountInPaise`, `refundedInPaise`, `cancellationReason`, `expiredAt` |
| **OrderItem** | `priceInPaise` snapshot, `discountInPaise`, `taxableValueInPaise`, `cgstInPaise`/`sgstInPaise`/`igstInPaise`, `quantity`, `returnedQuantity`                     |
| **Payment**   | `providerOrderId` (Razorpay `order_…`), `providerPaymentId` (`pay_…`), `status`, `amountInPaise`, `failureReason`, `rawPayload`                                  |
| **Refund**    | `status`, `razorpayRefundId`, `amountInPaise`, `failureReason`, `processedAt`                                                                                    |
| **Shipment**  | `status`, `awb`, `courier`, `labelUrl`, `lastError`, `rawPayload`                                                                                                |
| **Coupon**    | type, value, min order, max discount, dates, total/per-user limits, `isActive`                                                                                   |

## Status enums

| Enum                                                                              | Values                                                                                           | Rules in                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| `OrderStatus`                                                                     | PENDING, PAID, SHIPPED, DELIVERED, CANCELLED, FAILED, RETURN_REQUESTED, REFUND_PENDING, REFUNDED | `lib/order-status.ts`           |
| `ReservationState`                                                                | NONE, ACTIVE, CONVERTED, RELEASED                                                                | `services/inventory.service.ts` |
| `PaymentStatus`, `RefundStatus`, `ShipmentStatus`, `ReturnStatus`, `ReviewStatus` | see schema                                                                                       | the matching service            |

## Changing the schema safely

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate -- --name short_description` (creates `prisma/migrations/<timestamp>_short_description/` and applies it locally).
3. Read the generated SQL. Prefer **additive** changes (new nullable column / column with default) so the previous deployment keeps working during rollout.
4. Commit the migration folder with the code. Vercel runs `prisma migrate deploy` on every deploy (`vercel-build` script).
5. Never edit a migration that is already applied in production — add a new one.

> History note: Phases 14–16 (reviews, search, audit log) were added to the schema without a migration. That gap was fixed by `20261011120000_phase14_16_reviews_search_audit`, written to be safe on databases that already have those tables.
