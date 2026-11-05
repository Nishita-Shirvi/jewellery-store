# Launch plan

How the store goes live, what to watch in the first day, and how to undo a bad release.
Before starting: every line of `GO_LIVE_CHECKLIST.md` ticked.

## 1. Soft launch (week 1)

1. **Day 0 — friends and family.** Site live on the real domain with live Razorpay, but not announced. 5–10 people you know place real orders (one COD, one prepaid, one with a coupon, one return). Check each order end to end: email, invoice, Admin → Orders, shipping, the money in Razorpay.
2. **Day 1–2 — quiet public.** Share the link with existing customers only (WhatsApp / Instagram story). Keep COD on with the low limit (`[cod] max_order_rupees`).
3. **Day 3–7 — full launch.** Announce, start ads, newsletter. Raise limits only once the first week's reconciliation (Admin → Accounting) shows no unexplained differences.

Pick launch times on a **weekday morning** (Tue–Thu), never before a holiday or on a Friday evening: people need to be around to watch.

## 2. First 24 hours — what to watch

| When              | Where                         | Healthy                                                     | If not                                                        |
| ----------------- | ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Every hour        | Admin → System                | All alerts OK, cron < 45 min ago, health OK                 | `RUNBOOK.md` → the section the alert names                    |
| Every hour        | Admin → Orders                | New orders arrive; none stuck in "Payment pending" > 30 min | Check Razorpay dashboard; RUNBOOK "Payments are failing"      |
| Every 2 hours     | Admin → Jobs                  | Nothing failed                                              | Retry; read the error; RUNBOOK "Background jobs have failed"  |
| Morning + evening | Razorpay dashboard → Payments | Success rate > 80 %                                         | Pause checkout (below) if payments fail and you can't see why |
| Evening           | Admin → Reports               | Orders and revenue match Razorpay                           | Admin → Accounting → upload settlement report                 |
| Evening           | Inbox (alerts email) + Sentry | No new error types                                          | Fix or pause the feature                                      |
| Day 2             | Admin → Accounting            | Settlement / COD reconciliation: no unexplained differences | Look at each listed difference                                |

Numbers to write down at the end of day 1: orders, revenue, payment success rate, COD share, refunds/cancellations, errors in Sentry, slowest page (Vercel → Speed Insights).

## 3. When something goes wrong

**First, stop the damage — kill switches** (Admin → System → Kill switches, takes effect within seconds):

| Problem                                           | Switch                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Wrong prices, payments failing, orders not saving | Pause **Checkout**                                                   |
| Fake COD orders / many refusals                   | Pause **Cash on delivery**                                           |
| A coupon leaked or is being abused                | Pause **Coupons** (or deactivate that one coupon in Admin → Coupons) |
| Odd or slow recommendation rows                   | Pause **Recommendation rows**                                        |

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
