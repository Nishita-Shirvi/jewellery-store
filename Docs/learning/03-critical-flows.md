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

- **1 · `pay-button.tsx`**
  - What happens: Customer clicks **Pay**. The browser sends a `checkoutKey` (one per click session).
- **2 · `startCheckoutAction` → `startCheckout()`**
  - What happens: Same `checkoutKey` seen before? → return the **same** order (double-click safe).
- **3 · `startCheckout()`**
  - What happens: Check address belongs to user; `releaseExpiredReservations()` frees stale holds; cart must have no issues; pincode serviceable (skipped if Shiprocket off/down); coupon re-checked.
- **4 · DB transaction**
  - What happens: Prices and stock **re-read from the DB** (a rate-linked price changed by a rate save since the cart was priced → "A price just changed"); GST split computed (`lib/gst.ts`, seller state from `config/business.ini`); `Order` (PENDING) + `OrderItem`s with price snapshots created; `reserveLines()` holds stock for `[inventory] reservation_minutes`. If any piece is gone, the whole transaction rolls back → "Some items just sold out".
- **5 · `createRazorpayOrder()`**
  - What happens: Razorpay order created, `Payment` row stored. If Razorpay is unreachable → order FAILED, hold released, friendly error.
- **6 · Browser**
  - What happens: Razorpay popup opens (`components/checkout/razorpay.ts`).
- **7a**
  - Where: `verifyPaymentAction`
  - What happens: Popup success → HMAC signature verified on the server → `markOrderPaid(source: "callback")`.
- **7b**
  - Where: Razorpay webhook
  - What happens: Independently, Razorpay calls `/api/webhooks/razorpay` with `payment.captured` → `markOrderPaid(source: "webhook")`.
- **8 · `markOrderPaid()`**
  - What happens: **Idempotent.** In one transaction: order PENDING/FAILED/CANCELLED → PAID (conditional update — only the first caller wins), coupon redemption counted, reservation **converted** into a real stock decrease, payment marked captured, cart cleared. Then: funnel counter, invoice created, confirmation email.
- **9 · `app/orders/[id]/success`**
  - What happens: Customer sees the success page.

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

- **`reserveLines`**
  - When: Checkout start
  - Effect: `reservedStock += qty` **only if** available ≥ qty (one SQL `UPDATE … WHERE`) → state ACTIVE
- **`convertReservation`**
  - When: Paid
  - Effect: `stock −= qty`, `reservedStock −= qty` → CONVERTED
- **`releaseReservation`**
  - When: Failed / cancelled
  - Effect: `reservedStock −= qty` → RELEASED
- **`releaseExpiredReservations`**
  - When: Cron + every checkout start
  - Effect: All ACTIVE orders past `reservedUntil` → CANCELLED, stock given back

Why no overselling: two buyers racing for the last piece both run the conditional UPDATE; Postgres row locks make one wait, and then its condition fails. Proven in `tests/db/reservation.test.ts`.

## 3. Razorpay webhook

**File:** `app/api/webhooks/razorpay/route.ts`

1. Rate limit → 2. secret configured? (503 if not) → 3. body ≤ 256 KB → 4. **HMAC signature check** (400 if bad, log `webhook.razorpay_bad_signature`) → 5. parse with Zod → 6. dispatch:

- **`payment.captured`** — `markOrderPaid`
- **`payment.failed`** — `markPaymentFailed`
- **`refund.processed`** — `markRefundProcessed`
- **`refund.failed`** — `markRefundFailed`

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

**Safety rules in this flow** (`services/order.service.ts`, `services/refund.service.ts`):

- Sold out at payment: one transaction moves the order to REFUND_PENDING, releases the hold, records the payment and creates the refund row; Razorpay is called afterwards. A repeated webhook answers "sold out".
- A second payment on an already paid/cancelled order is saved as its own Payment and refunded in full; it never changes the order's refunded total.
- Each refund is claimed (`REFUND_SENDING`) before Razorpay is called, so it is sent once. The reservations job sends refunds that got stuck.
- Cancelling is refused once a Shiprocket shipment or AWB exists — cancel the parcel first.

## 5. Returns

**Files:** `app/account/orders/[id]/return/*`, `services/return.service.ts`, `lib/returns.ts`

1. Customer: within `[returns] window_days` (`config/shipping.ini`, default 7; `0` = no returns) of delivery, picks items + reason + optional photo (must be our own upload in the returns folder, `isOwnUpload`) → `requestReturn()` → order RETURN_REQUESTED, email.
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
- **Refused while business details are placeholders** (`getBusiness().incomplete`): no invoice, no number used, log `invoice.skipped_business_details_incomplete`.
- The PDF is rendered on demand from that frozen data — changing `config/business.ini` later never changes old invoices.
- If invoice creation failed or was skipped, the admin can press **Generate invoice** on the order page.

## 8. Saving gold rates → repricing

**Files:** `app/admin/storefront-actions.ts` (`saveRatesAction`), `services/metal-rate.service.ts`, `lib/metal-pricing.ts`

1. Admin enters ₹ per gram for some purities (empty = keep). Needs `products.edit`.
2. One transaction (`saveRates`): read current rates → any change above `[pricing] large_change_percent` without the tick box → `RateError` (nothing saved). A new `MetalRate` row for every rate entered (history is kept; saving the same rate records "checked today" and clears the stale warning). For purities whose rate actually changed, `repriceRateLinked` gives **every variant** of every `RATE_LINKED` product its own price from its own net weight: round to rupee((net g × rate + making + stone charge) × (1 + GST)). The product's "from" price is refreshed and a variant's "was" price that is no longer above the new price is cleared.
3. After commit: `revalidateTag(RATES_TAG)` (+ `CATALOG_TAG` if a price changed), audit log, log `metal_rates.saved`.
4. Customers mid-checkout hit the normal "A price just changed" check. Orders already placed keep their price.

Saving a rate-linked product, its options or its variant grid calls `repriceProduct` in the same transaction, so a typed price is replaced. Saving refuses when there is no rate for the purity or a variant has no net weight.

## 9. Editing a product without losing a sale

**File:** `services/admin/product-admin.service.ts`

- The product form and the quick stock box send the stock shown when they were opened. If a sale changed it meanwhile, the save is refused ("Stock changed while you were editing (now N)") instead of silently undoing the sale. The variant grid has no such check yet (BACKLOG BL-19).
- A new URL name keeps the old one in `previousSlugs`; `/products/<old>` → `findRenamedProductSlug` → permanent redirect.
- `deleteProduct` refuses products that were ever ordered; hide them instead.
