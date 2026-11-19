# Launch plan

How the store goes live, what to watch in the first day, and how to undo a bad release.
Before starting: every line of `GO_LIVE_CHECKLIST.md` ticked.

## 1. Soft launch (week 1)

1. **Day 0 — friends and family.** Site live on the real domain with live Razorpay, but not announced. 5–10 people you know place real orders (one COD, one prepaid, one with a coupon, one return). Check each order end to end: email, invoice, Admin → Orders, shipping, the money in Razorpay.
2. **Day 1–2 — quiet public.** Share the link with existing customers only (WhatsApp / Instagram story). Keep COD on with the low limit (`[cod] max_order_rupees`).
3. **Day 3–7 — full launch.** Announce, start ads, newsletter. Raise limits only once the first week's reconciliation (Admin → Accounting) shows no unexplained differences.

Pick launch times on a **weekday morning** (Tue–Thu), never before a holiday or on a Friday evening: people need to be around to watch.

## 2. First 24 hours — what to watch

**Every hour**

- Admin → System: all alerts OK, cron ran in the last 45 minutes. If not, follow the section in `RUNBOOK.md` that the alert names.
- Admin → Orders: new orders are coming in, and none has been "Payment pending" for more than 30 minutes. If one has, check Razorpay (RUNBOOK → "Payments are failing").

**Every 2 hours**

- Admin → Jobs: nothing failed. If something did, read the error and press Retry.

**Morning and evening**

- Razorpay → Payments: more than 80% succeed. If payments keep failing and you can't see why, pause checkout (below).

**Evening**

- Admin → Reports: orders and revenue match Razorpay.
- Alert emails and Sentry: no new kinds of errors.

**Day 2**

- Admin → Accounting: upload the settlement and COD files. There should be no unexplained differences.

Numbers to write down at the end of day 1: orders, revenue, payment success rate, COD share, refunds/cancellations, errors in Sentry, slowest page (Vercel → Speed Insights).

## 3. When something goes wrong

**First, stop the damage — kill switches** (Admin → System → Kill switches, takes effect within seconds):

- Wrong prices, payments failing, orders not saving → pause **Checkout**
- Fake COD orders or many refused parcels → pause **Cash on delivery**
- A coupon leaked or is being abused → pause **Coupons** (or switch off just that coupon in Admin → Coupons)
- Odd or slow recommendation rows → pause **Recommendation rows**

Customers see a short "paused" message; carts are kept. Turn the switch back on when fixed.

**Then roll back the code if a release caused it:**

1. Vercel → Project → **Deployments** → the last good deployment → **⋯ → Promote to Production** (instant; no rebuild).
2. Check `/api/health` and place a test order.
3. On GitHub, revert the bad PR (PR page → **Revert**) so the next deploy doesn't bring the problem back.

**Database changes:** every migration in this project only adds things (new tables/columns), so the previous code version runs fine on the newer database — rolling back the code is enough. If data itself was damaged, restore to a moment before the problem (`BACKUPS.md` → "Restore the database to an earlier moment").

**Who decides:** the owner pauses switches; whoever looks after the code does rollbacks. Write down what happened (time, what customers saw, what was done) in `Docs/note.md`.

## 4. After the first week

- Run the restore drill on production if not done yet (`BACKUPS.md`).
- Review: alert emails received (too many? too few?), Admin → Jobs failures, reconciliation differences, customer support tickets.
- Raise COD limits / turn on SMS / start marketing emails as planned.
