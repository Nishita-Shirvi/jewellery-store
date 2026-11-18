# 03 — Critical flows, step by step

These are the flows where bugs cost money. Read each with the named file open.

Order status rules for all of them: `lib/order-status.ts` → `ORDER_TRANSITIONS`.

```
PENDING ──pay──► PAID ──ship──► SHIPPED ──deliver──► DELIVERED ──return──► RETURN_REQUESTED
   │               │                                                         │        │
   │fail/expire    │cancel (customer/admin) → refund                approve  │        │ reject
   ▼               ▼                                                         ▼        ▼
FAILED/CANCELLED  REFUND_PENDING ───────── refund.processed ─────────► REFUNDED   DELIVERED
       │               ▲
       └─paid late,────┘  (sold out after payment: PENDING/FAILED/expired-CANCELLED → REFUND_PENDING)
         sold out
```

---

## 1. Checkout → payment (the most important flow)

**Files:** `app/checkout/actions.ts`, `services/order.service.ts`, `services/inventory.service.ts`, `lib/payments/razorpay.ts`, `components/checkout/pay-button.tsx`

| Step | Where                                     | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pay-button.tsx`                          | Customer clicks **Pay**. The browser sends a `checkoutKey` (one per click session).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2    | `startCheckoutAction` → `startCheckout()` | Same `checkoutKey` seen before? → return the **same** order (double-click safe).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3    | `startCheckout()`                         | Check address belongs to user; `releaseExpiredReservations()` frees stale holds; cart must have no issues; pincode serviceable (skipped if Shiprocket off/down); coupon re-checked.                                                                                                                                                                                                                                                                                                                                                                       |
| 4    | DB transaction                            | Prices and stock **re-read from the DB** (a rate-linked price changed by a rate save since the cart was priced → "A price just changed"); stock checked against the **sum of all sizes** of the same piece; GST split computed (`lib/gst.ts`, seller state from `config/business.ini`); `Order` (PENDING) + `OrderItem`s with price snapshots, `size` and `productSnapshot.pricingMode` created; `reserveLines()` holds stock for `[inventory] reservation_minutes`. If any piece is gone, the whole transaction rolls back → "Some items just sold out". |
| 5    | `createRazorpayOrder()`                   | Razorpay order created, `Payment` row stored. If Razorpay is unreachable → order FAILED, hold released, friendly error.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6    | Browser                                   | Razorpay popup opens (`components/checkout/razorpay.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 7a   | `verifyPaymentAction`                     | Popup success → HMAC signature verified on the server → `markOrderPaid(source: "callback")`.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7b   | Razorpay webhook                          | Independently, Razorpay calls `/api/webhooks/razorpay` with `payment.captured` → `markOrderPaid(source: "webhook")`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 8    | `markOrderPaid()`                         | **Idempotent.** In one transaction: order PENDING/FAILED/expired-CANCELLED → PAID (conditional update = row lock — only the first caller wins), coupon redemption counted, reservation **converted** into a real stock decrease (`convertReservation` reads the hold state itself under that lock), payment marked captured, cart cleared. Then: funnel counter, invoice created (skipped while business details are placeholders), confirmation email.                                                                                                   |
| 9    | `app/orders/[id]/success`                 | Customer sees the success page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Edge cases handled (and where):**

- Callback and webhook arrive together / in any order → only one wins (`updateMany` with status condition). The loser goes to `handleNotTransitioned()`: same Razorpay payment id as the one already recorded → logs `payment.already_processed` (and sends any refund of that payment a crash left unsent, `sendUnsentRefunds`).
- Amount paid ≠ order total → `payment.amount_mismatch` (error), order not marked paid.
- Customer paid **after** the hold expired and the piece sold to someone else (or the coupon ran out) → `handleSoldOut()` in **one transaction**: order → REFUND_PENDING (reason "Sold out after payment — refunded in full"), hold released, payment recorded as CAPTURED, `Refund` row created (`createRefundRecord`). After the commit `issueRefund()` calls Razorpay; outcome `"sold_out"`, log `payment.sold_out_after_payment_refunding`. If that Razorpay call is lost, the refund is still in the DB and is sent by the cron sweep, the admin's **Retry refund** or a redelivered webhook. (This replaced the old two-step `refundSoldOutOrder`, which could leave an order CANCELLED with no refund row after a crash.)
- **A different** captured payment for an order that is already paid (customer paid twice) or cancelled → `recordExtraPaymentRefund()`: in one transaction a separate `Payment` row (`providerOrderId = "extra:<razorpay payment id>"`) and a full `Refund` are created, then `issueRefund()`. Outcome `"already_processed"` (order paid) or `"extra_payment_refunded"` (order cancelled; checkout tells the customer). Log `payment.extra_payment_refunding`. These refunds never change the order's `refundedInPaise` or status. Idempotent per Razorpay payment id.
- Payment failed → `markPaymentFailed()` → FAILED, hold released; the customer can retry from the failed page (`retryPaymentAction` → `resumePayment`). The failed page never prints the `?reason=` text.

## 2. Stock holds (reservations)

**File:** `services/inventory.service.ts` · **Data:** `Product.stock`, `Product.reservedStock`, `Order.reservationState`, `Order.reservedUntil`

```
available = stock − reservedStock
```

| Function                     | When                        | Effect                                                                                                                                                                                                                                                              |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reserveLines`               | Checkout start              | `reservedStock += qty` **only if** available ≥ qty (one SQL `UPDATE … WHERE`) → state ACTIVE                                                                                                                                                                        |
| `convertReservation`         | Paid                        | First switches the order ACTIVE → CONVERTED (or RELEASED/NONE → CONVERTED) with a conditional update, then: from a live hold `stock −= qty`, `reservedStock −= qty`; from an expired hold takes from available stock, or throws `InsufficientStockError` → sold out |
| `releaseReservation`         | Failed / cancelled          | `reservedStock −= qty` → RELEASED                                                                                                                                                                                                                                   |
| `releaseExpiredReservations` | Cron + every checkout start | All ACTIVE orders past `reservedUntil` → CANCELLED, stock given back                                                                                                                                                                                                |

Why no overselling: two buyers racing for the last piece both run the conditional UPDATE; Postgres row locks make one wait, and then its condition fails. Proven in `tests/db/reservation.test.ts`.

Race fixed on 2026-11-18: `markOrderPaid` used to read `reservationState` **before** locking the order, so if the expiry job released the hold in between, payment could "convert" a hold that no longer existed and eat another customer's reserved stock. Now `convertReservation` decides from the state it switches under the lock.

Sizes share stock: the cart (`priceCart`, `addItem`) and checkout add up every size line of one product before comparing with available stock.

## 3. Razorpay webhook

**File:** `app/api/webhooks/razorpay/route.ts`

1. Rate limit → 2. secret configured? (503 if not) → 3. body ≤ 256 KB → 4. **HMAC signature check** (400 if bad, log `webhook.razorpay_bad_signature`) → 5. parse with Zod → 6. dispatch:

| Event              | Calls                 |
| ------------------ | --------------------- |
| `payment.captured` | `markOrderPaid`       |
| `payment.failed`   | `markPaymentFailed`   |
| `refund.processed` | `markRefundProcessed` |
| `refund.failed`    | `markRefundFailed`    |

Returns 200 even for "already processed" so Razorpay stops retrying. A 500 makes Razorpay retry later — safe because every handler is idempotent.

## 4. Customer cancels a paid order → automatic refund

**Files:** `app/account/orders/actions.ts` → `services/return.service.ts` (`cancelPaidOrder`) → `services/refund.service.ts`

1. Allowed only while PAID and no **live courier shipment** exists — a Shiprocket shipment id or AWB that isn't CANCELLED (`hasLiveShipment`, used by `canCustomerCancel` and `cancelPaidOrder`). Applies to admins too: they must cancel the Shiprocket shipment first.
2. Transaction: PAID → REFUND_PENDING, then the shipment is **re-checked under the order row lock** (rollback if one appeared), items restocked, `Refund` row created. `createShipmentForOrder` saves the Shiprocket ids under the same lock (`SELECT … FOR UPDATE`), and if it finds the order cancelled it logs `shipment.created_for_cancelled_order` and tells the admin to cancel that Shiprocket order.
3. `issueRefund()` sends it to Razorpay (see **Refund sending** below).
4. Email "cancelled".
5. Later Razorpay sends `refund.processed` → `markRefundProcessed()` → `Order.refundedInPaise` updated; when no refund of the order's own payment is left PENDING/FAILED → REFUNDED (or DELIVERED after a partial return); email "refund processed".
6. If Razorpay fails → `Refund` status FAILED; admin sees **Retry refund** on the order page (`retryRefundAction` → `retryRefund`).

Admin cancelling a PAID order from the admin panel follows the same path (`updateOrderStatus` hands PAID → CANCELLED to `cancelPaidOrder`). Cancelling an unpaid order only releases its hold.

### Refund sending (`services/refund.service.ts`)

Every refund is a `Refund` row first (created inside the business transaction), Razorpay second. `issueRefund(refundId)` is safe to call any number of times, even at once:

1. **Claim:** a conditional update sets the row to PENDING + `razorpayRefundId = null` + `failureReason = "Sending to Razorpay…"` (`REFUND_SENDING`). Only the caller whose update matched continues; others return `"skipped"`. A claim older than 10 minutes (`STUCK_REFUND_MS`) counts as abandoned by a crash and can be taken over.
2. **Ask Razorpay first:** `listRazorpayRefunds(paymentId)` finds refunds already made with our reference. A live one (lost response) is reused; failed ones are ignored and a new attempt is made with reference `<refundId>:<attempt>`.
3. **Save only if still ours:** the Razorpay id is written with a condition, so a fast `refund.processed` webhook is never overwritten.
4. `createRefundRecord` refuses a total above the amount paid (PENDING + PROCESSED + FAILED refunds of that payment all count).

Who calls it: the flow that created the refund; the admin's **Retry refund** (FAILED, or PENDING never sent for 10+ minutes — `canRetryRefund`); the cron `/api/cron/release-reservations` (`sendStuckRefunds`, up to 20 PENDING never-sent refunds older than 10 minutes; FAILED ones are left to the admin); and a redelivered payment webhook (`sendUnsentRefunds`). `markRefundFailed` throws while a retry is mid-flight, so Razorpay redelivers that webhook later instead of it being applied to the wrong attempt.

## 5. Returns

**Files:** `app/account/orders/[id]/return/*`, `services/return.service.ts`, `lib/returns.ts`

1. Customer: within `[returns] window_days` (`config/shipping.ini`, default 7; `0` = no returns) of delivery, picks items + reason + optional photo (must be one of our uploads, `lib/media.ts`) → `requestReturn()` → order RETURN_REQUESTED, email.
2. Admin (`/admin/returns`): **Approve** → items marked returned, optional restock, refund for those items (partial refunds supported) → REFUND_PENDING → (webhook) → REFUNDED or back to DELIVERED if only part was returned. **Reject** → back to DELIVERED.

## 6. Shipping (Shiprocket)

**Files:** `services/shipment.service.ts`, `lib/shipping/shiprocket.ts`, `app/api/webhooks/courier-updates/route.ts`

1. Admin presses **Create shipment** on a PAID order → Shiprocket order → AWB + courier → label PDF → pickup request. Each step is saved on `Shipment`; pressing again after a failure **resumes** instead of creating a duplicate parcel. Errors are kept in `Shipment.lastError`.
2. Shiprocket calls `/api/webhooks/courier-updates` (token in `x-api-key`) → `applyTrackingUpdate()`: adds `ShipmentEvent` rows (duplicates ignored), never moves status backwards, PAID → SHIPPED on pickup/in transit, → DELIVERED on delivery; customer gets an email.
3. Without Shiprocket keys: admin moves the order PAID → SHIPPED → DELIVERED by hand.

## 7. GST invoice

**Files:** `services/invoice.service.ts`, `lib/invoice/invoice-pdf.tsx`, `lib/gst.ts`, `app/api/invoices/[orderId]/route.ts`

- Tax is calculated **at checkout** and stored on each `OrderItem` (CGST+SGST for same state as `[business] state`, otherwise IGST).
- After payment, `createInvoiceForOrder()` takes the next number from `InvoiceCounter` under a row lock (`[invoice] prefix`/financial-year/sequence) and freezes seller + buyer details in `Invoice`.
- **Refused while business details are placeholders** (`getBusiness().incomplete`): returns null, logs `invoice.skipped_business_details_incomplete`, no number used.
- CGST/SGST vs IGST on the invoice comes from the split **stored on the order items**; only orders without a stored split fall back to comparing `[business] state` with the address.
- The PDF is rendered on demand from that frozen data — changing `config/business.ini` later never changes old invoices.
- If invoice creation failed or was skipped, the admin can press **Generate invoice** on the order page.

## 8. Saving gold rates → repricing

**Files:** `app/admin/storefront-actions.ts` (`saveRatesAction`), `services/metal-rate.service.ts`, `lib/metal-pricing.ts`

1. Admin enters ₹ per gram for some purities (`metalRateFormSchema`; empty = keep).
2. One transaction: read current rates → any change above `[pricing] large_change_percent` without the tick box → `RateError` (nothing saved). For each purity whose rate actually changed, a new `MetalRate` row (history is kept). Then every `RATE_LINKED` product of those purities gets `priceInPaise = rateLinkedPrice(...)`.
3. After commit: `revalidateTag(RATES_TAG)` (+ `CATALOG_TAG` if a price changed), audit `metal_rate.update`, log `metal_rates.saved`.
4. Customers mid-checkout hit the normal "A price just changed" check. Orders already placed keep their price.

Product save (`priceForSave`): FIXED keeps the typed price; RATE_LINKED calculates it from the current rate and refuses when there is no rate for that purity or no net weight.

## 9. Editing a product without losing a sale

**File:** `services/admin/product-admin.service.ts` (`updateProduct`)

- The form sends `stockOriginal` (stock when the form was opened). Stock is written only if the admin changed it, and only with `WHERE stock = stockOriginal`; otherwise "Stock changed while you were editing (now N)".
- A new URL name pushes the old one onto `previousSlugs` (last 20); `/products/<old>` → `findRenamedProductSlug` → 308 redirect.
- `deleteProduct` refuses products with order items (and catches the foreign-key error if an order lands at the same instant).
