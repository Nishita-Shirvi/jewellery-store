# 06 — Practice exercises

Do these on a local copy with a local/throwaway database (never production). Each one teaches one area. Undo your change afterwards with `git checkout .`.

## Warm-up (settings, logs)

1. **Change a business rule without code.** Set `fee_rupees = 49` in `config.ini`, restart `npm run dev`, check the cart. Then set `SHIPPING_FEE_RUPEES=0` in `.env` and confirm the env value wins.
2. **Break config on purpose.** Set `state = Telengana` (typo). Read the startup error. Fix it.
3. **Debug logs.** Set `[logging] level = debug`, add `logger.debug("cart.viewed", { itemCount })` in `app/cart/page.tsx`, open `/cart`, find the line. Set the level back to `info` and see it disappear.
4. **Errors with stacks.** Temporarily add `throw new Error("test")` as the first line inside the `try` of `checkDatabase()` in `services/health.service.ts`. Call `/api/health` → you get HTTP 503, and the terminal shows `health.db_ping_failed` with the error's message and stack (file + line). Remove the line again.

## Read and trace (no code changes)

5. Starting from `components/catalog/catalog-filters.tsx`, write down every file involved in filtering by "18K". (Answer is in `02-feature-map.md`.)
6. In `services/order.service.ts`, find the exact line that guarantees an order can only be marked PAID once. Explain why two simultaneous calls can't both pass it.
7. In `lib/order-status.ts`, list every way an order can reach REFUNDED, then find the code for each.

## Payments (needs Razorpay **test** keys)

8. Do a test payment. In the logs, find `payment.order_paid` and note whether it came from `callback` or `webhook`. In Prisma Studio, watch `Order.reservationState` go ACTIVE → CONVERTED and `Product.stock` drop.
9. Start checkout, close the popup, wait past the hold time (or set `reservation_minutes = 5`), call `/api/cron/release-reservations` with `Authorization: Bearer <CRON_SECRET>`. Confirm stock comes back and the order is CANCELLED.
10. Cancel a paid order from the customer account. Follow the `Refund` row and the log lines.

## Write a test

11. Add a test to `tests/shipping.test.ts` proving that an order exactly at `free_above_rupees` ships free.
12. Add a test to `tests/gst.test.ts` for a buyer in a different state (expect IGST only).
13. Run `npm run verify`. All green = done.

## Make a small feature end to end

14. Add a setting `[catalog] page_size = 12` to `config.ini` and use it instead of `PAGE_SIZE` in `lib/validation/catalog.ts` → **watch out**: check whether that file is imported by a browser component first (`grep -r "lib/validation/catalog" components`). If it is, you must pass the value from the server instead. This is the most common mistake with `config.ini` — it's server-only.
15. Update `Docs/CONFIGURATION.md` with your new key.

If you can do 6, 8, 11 and 14 without help, you know the project well enough to fix most bugs on your own.
