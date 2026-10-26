# 03 — Critical flows, step by step

These are the flows where bugs cost money. Read each with the named file open.

Order status rules for all of them: `lib/order-status.ts` → `ORDER_TRANSITIONS`.

```
PENDING ──pay──► PAID ──ship──► SHIPPED ──deliver──► DELIVERED ──return──► RETURN_REQUESTED
   │               │                                                         │        │
   │fail/expire    │cancel (customer/admin) → refund                approve  │        │ reject
   ▼               ▼                                                         ▼        ▼
FAILED/CANCELLED  REFUND_PENDING ───────── refund.processed ─────────► REFUNDED   DELIVERED
```

---

## 1. Checkout → payment (the most important flow)

**Files:** `app/checkout/actions.ts`, `services/order.service.ts`, `services/inventory.service.ts`, `lib/payments/razorpay.ts`, `components/checkout/pay-button.tsx`

| Step | Where                                     | What happens                                                                                                                                                                                                                                                                                                                         |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `pay-button.tsx`                          | Customer clicks **Pay**. The browser sends a `checkoutKey` (one per click session).                                                                                                                                                                                                                                                  |
| 2    | `startCheckoutAction` → `startCheckout()` | Same `checkoutKey` seen before? → return the **same** order (double-click safe).                                                                                                                                                                                                                                                     |
| 3    | `startCheckout()`                         | Check address belongs to user; `releaseExpiredReservations()` frees stale holds; cart must have no issues; pincode serviceable (skipped if Shiprocket off/down); coupon re-checked.                                                                                                                                                  |
| 4    | DB transaction                            | Prices and stock **re-read from the DB**; GST split computed (`lib/gst.ts`, seller state from `config.ini`); `Order` (PENDING) + `OrderItem`s with price snapshots created; `reserveLines()` holds stock for `[inventory] reservation_minutes`. If any piece is gone, the whole transaction rolls back → "Some items just sold out". |
| 5    | `createRazorpayOrder()`                   | Razorpay order created, `Payment` row stored. If Razorpay is unreachable → order FAILED, hold released, friendly error.                                                                                                                                                                                                              |
| 6    | Browser                                   | Razorpay popup opens (`components/checkout/razorpay.ts`).                                                                                                                                                                                                                                                                            |
| 7a   | `verifyPaymentAction`                     | Popup success → HMAC signature verified on the server → `markOrderPaid(source: "callback")`.                                                                                                                                                                                                                                         |
| 7b   | Razorpay webhook                          | Independently, Razorpay calls `/api/webhooks/razorpay` with `payment.captured` → `markOrderPaid(source: "webhook")`.                                                                                                                                                                                                                 |
| 8    | `markOrderPaid()`                         | **Idempotent.** In one transaction: order PENDING/FAILED/CANCELLED → PAID (conditional update — only the first caller wins), coupon redemption counted, reservation **converted** into a real stock decrease, payment marked captured, cart cleared. Then: funnel counter, invoice created, confirmation email.                      |
| 9    | `app/orders/[id]/success`                 | Customer sees the success page.                                                                                                                                                                                                                                                                                                      |

**Edge cases handled (and where):**

- Callback and webhook arrive together / in any order → only one wins (`updateMany` with status condition) → the other logs `payment.already_processed`.
- Amount paid ≠ order total → `payment.amount_mismatch` (error), order not marked paid.
- Customer paid **after** the hold expired and the piece sold to someone else → `outcome: "sold_out"` → automatic full refund (`refundSoldOutOrder` in `services/return.service.ts`), log `payment.sold_out_after_payment_refunding`.
- Payment failed → `markPaymentFailed()` → FAILED, hold released; the customer can retry from the failed page (`retryPaymentAction` → `resumePayment`).

## 2. Stock holds (reservations)

**File:** `services/inventory.service.ts` · **Data:** `Product.stock`, `Product.reservedStock`, `Order.reservationState`, `Order.reservedUntil`

```
available = stock − reservedStock
```

| Function                     | When                        | Effect                                                                                       |
| ---------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| `reserveLines`               | Checkout start              | `reservedStock += qty` **only if** available ≥ qty (one SQL `UPDATE … WHERE`) → state ACTIVE |
| `convertReservation`         | Paid                        | `stock −= qty`, `reservedStock −= qty` → CONVERTED                                           |
| `releaseReservation`         | Failed / cancelled          | `reservedStock −= qty` → RELEASED                                                            |
| `releaseExpiredReservations` | Cron + every checkout start | All ACTIVE orders past `reservedUntil` → CANCELLED, stock given back                         |

Why no overselling: two buyers racing for the last piece both run the conditional UPDATE; Postgres row locks make one wait, and then its condition fails. Proven in `tests/db/reservation.test.ts`.

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

1. Allowed only while PAID and not yet shipped (`canCustomerCancel`).
2. Transaction: PAID → REFUND_PENDING, items restocked, `Refund` row created.
3. `issueRefund()` calls Razorpay (checks first whether Razorpay already has this refund, so a retry never refunds twice).
4. Email "cancelled".
5. Later Razorpay sends `refund.processed` → `markRefundProcessed()` → `Order.refundedInPaise` updated; when nothing is left open → REFUNDED; email "refund processed".
6. If Razorpay fails → `Refund` status FAILED; admin sees **Retry refund** on the order page (`retryRefundAction`).

Admin cancelling a PAID order from the admin panel follows the same refund path.

## 5. Returns

**Files:** `app/account/orders/[id]/return/*`, `services/return.service.ts`, `lib/returns.ts`

1. Customer: within `RETURN_WINDOW_DAYS` (7) of delivery, picks items + reason + optional photo → `requestReturn()` → order RETURN_REQUESTED, email.
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
- The PDF is rendered on demand from that frozen data — changing `config.ini` later never changes old invoices.
- If invoice creation failed, the admin can press **Generate invoice** on the order page.
