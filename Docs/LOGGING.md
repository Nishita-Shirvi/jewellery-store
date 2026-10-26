# Logging and debugging

## The logger

All server code logs through `lib/logger.ts`. `console.*` is blocked by ESLint in `app/`, `lib/`, `services/` and `auth.ts`.

```ts
import { logger } from "@/lib/logger";

logger.info("order.paid", { orderId }); // normal business event
logger.warn("webhook.razorpay_bad_signature", { ip }); // suspicious / recoverable
logger.error("refund.failed_to_send", { refundId, error }); // pass the Error itself → stack is kept
logger.debug("checkout.cart_priced", { lines, total }); // only printed when level = debug

const log = logger.child({ module: "shipping", orderId }); // fields added to every line
log.info("shipment.created", { awb });
```

| Feature   | Behaviour                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Levels    | `debug < info < warn < error`. Set in `config.ini` → `[logging] level`, or temporarily with env `LOGGING_LEVEL=debug`.               |
| Format    | Production: one JSON line per event. `npm run dev`: one readable line (`12:01:02.123 INFO  order.paid {"orderId":"…"}`).             |
| Errors    | Pass `{ error }` — the logger records `name`, `message` and `stack`.                                                                 |
| Redaction | Keys that look secret (`password`, `token`, `secret`, `authorization`, `cookie`, `signature`, `otp`, `apiKey`…) become `[redacted]`. |
| Sentry    | Every `error` line is also sent to Sentry when `SENTRY_DSN` is set (with the stack if an Error was passed).                          |

**Event names** are `area.what_happened` in snake case: `payment.order_paid`, `webhook.razorpay_received`, `cron.release_reservations`. Search the code for an event name to find exactly where it was written.

**Never log:** card data, full addresses, phone numbers, whole request bodies, passwords, API keys.

## Where to read logs

| Environment | Where                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------ |
| Local       | The terminal running `npm run dev`                                                         |
| Vercel      | Project → **Logs** (live + last few days). Filter by text, e.g. `payment.` or an order id. |
| Errors      | Sentry → Issues (if `SENTRY_DSN` is set). Each issue shows the stack and the `event` name. |

## Debugging tools built in

| Tool                    | How to use it                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.start` log line    | Written once per server start: which integrations are on (Razorpay test/live, email, Shiprocket, SMS…), shipping and stock settings. **Check this first** when a feature "does nothing".           |
| `GET /api/health`       | `{"status":"ok","db":"ok"}` or HTTP 503 when the database is unreachable. Use for uptime monitors.                                                                                                 |
| `errorId` in API errors | API routes that use `errorResponse()` (`lib/http.ts`) return `{"error":"Something went wrong.","errorId":"a1b2c3d4"}`. Search the logs for that id to get the full stack (`api.unexpected_error`). |
| Page error `digest`     | Next.js error pages show a digest; Vercel logs and Sentry contain the same digest with the stack.                                                                                                  |
| Admin → Audit log       | `/admin/audit`: who changed which product, order, coupon, review, and when (`services/audit.service.ts`).                                                                                          |
| Database rows           | `npm run db:studio` opens Prisma Studio. `Payment.rawPayload` and `Shipment.rawPayload` keep what Razorpay / Shiprocket actually sent.                                                             |
| `LOGGING_LEVEL=debug`   | Set on Vercel (or in `.env`), redeploy, reproduce the bug, then remove it again.                                                                                                                   |

## Debugging routine

1. **Reproduce** — exact page, user, order number, time.
2. **Find the log lines** around that time (filter by order id, user id or `errorId`).
3. **Find the code**: search the repo for the `event` name, or use `Docs/learning/02-feature-map.md` to jump from the feature to its files.
4. **Check the data** in Prisma Studio (order status, payment status, reservation fields).
5. **Write a failing test** next to the existing ones in `tests/`, fix, run `npm run verify`.

Symptom-by-symptom help: `Docs/learning/05-debugging-playbook.md`.
