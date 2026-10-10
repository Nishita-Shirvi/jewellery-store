# Jewellery Store

Online jewellery store for India, built phase by phase. Project goals, progress, blockers and decisions live in [`Docs/`](./Docs/readme.md).

**Current phase:** 12 — GST invoices and order emails (Week 2) (see `Docs/DEPLOY.md` and `Docs/GO_LIVE_CHECKLIST.md`) (backend first; the UI is a placeholder until the final design).

## Stack

- Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS v4 + shadcn/ui
- PostgreSQL + Prisma 6
- Zod for validation (including environment variables)
- Later phases: Auth.js v5, Razorpay, Resend, Vercel + Neon

## Folder structure

```
app/            Pages, layouts and API routes (UI + routing only)
  api/health/   GET /api/health — app + database check
components/     UI components
  layout/       Header, footer, search box
  ui/           shadcn/ui components
lib/            Infrastructure: env loader, database client, utilities
services/       Business logic (no business logic in components)
prisma/         Database schema and migrations
types/          Shared TypeScript types / API contracts
Docs/           Goals, progress, blockers, notes
```

## Requirements

- Node.js 20.9 or newer
- PostgreSQL 15+ (local install, Docker, or a free Neon database)

## Setup

1. **Install dependencies** (this also runs `prisma generate`):

   ```bash
   npm install
   ```

2. **Create your env file** and set the database URLs and `AUTH_SECRET`:

   ```bash
   cp .env.example .env
   ```

   Generate `AUTH_SECRET` with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   Quick local PostgreSQL with Docker:

   ```bash
   docker run --name jewellery-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=jewellery_store -p 5432:5432 -d postgres:16
   ```

3. **Create the database tables and load the dummy data:**

   ```bash
   npx prisma migrate dev --name phase2_schema
   npx prisma db seed
   ```

   The seed creates 1 admin user (from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), 4 categories and 20 dummy jewellery products. It is safe to run again. Run `npx prisma studio` to browse the data.

4. **Start the dev server:**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and http://localhost:3000/api/health.

## Scripts

| Command                           | What it does                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                     | Start the dev server                                              |
| `npm run build` / `npm start`     | Production build / run it                                         |
| `npm run lint`                    | ESLint                                                            |
| `npm run typecheck`               | TypeScript check                                                  |
| `npm run format` / `format:check` | Prettier (write / check)                                          |
| `npm run db:migrate`              | Create and apply a migration (development)                        |
| `npm run db:deploy`               | Apply migrations (production)                                     |
| `npm run db:seed`                 | Load the dummy catalogue and admin user                           |
| `npm run db:reset`                | Drop all data, re-apply migrations and re-seed (development only) |
| `npm run db:studio`               | Open Prisma Studio                                                |

## Environment variables

All variables are validated in `lib/env.ts` when the app starts. If one is missing or invalid, `npm run dev` / `npm run build` stops with a message listing what to fix. See `.env.example` for the full list.

## Catalog

- `/products` — all active jewellery, 12 per page. Filters and sorting live in the URL, e.g. `/products?category=rings&metal=GOLD&sort=price_asc`.
- `/products?q=jhumka` — search by name (the header search box uses this).
- `/products/<slug>` — product details: price, stock, metal, purity, weight, stones, hallmark.
- Catalog pages are cached for 5 minutes; Phase 7 admin edits refresh them instantly.

## GST invoices and emails

- Set `BUSINESS_GSTIN`, `BUSINESS_STATE` (e.g. Telangana) and `INVOICE_PREFIX` in `.env`. Same-state customers get CGST + SGST, others IGST.
- Each product has an HSN code and GST rate (Admin → Products → edit). Prices include GST.
- A tax invoice (`INV/2026-27/000001`) is created when an order is paid; customers download it from their order page, admins from the order in `/admin`. Older paid orders: **Generate invoice**.
- Customers get emails when an order is confirmed, shipped, delivered, cancelled or refunded. Set `RESEND_API_KEY` to send them for real.

## Cancellations, returns and refunds

- **Cancel:** customers cancel paid orders that aren't packed yet (Account → Orders → Cancel order); admins can cancel any paid order. Stock goes back and a full refund is sent through Razorpay automatically.
- **Return:** within 7 days of delivery, customers choose pieces, a reason and an optional photo. Admin → **Returns** → open the order → approve (optionally restock) or reject with a reason.
- **Refunds:** sent through Razorpay's API; confirmed by the `refund.processed` webhook (add the events `refund.processed` and `refund.failed` to your Razorpay webhook). Failed refunds show a **Retry** button.
- Customers get an email at every step.

## Shipping (Shiprocket)

1. Shiprocket → **Settings → API → Add New API User** (use a different email from your login). Put that email/password in `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`.
2. **Settings → Pickup Addresses**: note the pickup location's name → `SHIPROCKET_PICKUP_LOCATION` (default "Primary") and its pincode → `SHIPROCKET_PICKUP_PINCODE`.
3. After deploying: **Settings → API → Webhooks** → URL `https://<your-domain>/api/webhooks/courier-updates`, token = any long random text, also put in `SHIPROCKET_WEBHOOK_TOKEN`.
4. In `/admin/orders/<id>` press **Create shipment** on a paid order → courier, AWB, label PDF and tracking link appear; tracking updates move the order to Shipped and Delivered automatically.
5. Shipping fee: `SHIPPING_FEE_RUPEES` (₹99) unless the subtotal reaches `FREE_SHIPPING_ABOVE_RUPEES` (₹999).

Without Shiprocket keys, the pincode check stays silent and admins use "Mark as shipped / delivered" by hand.

## Admin panel (`/admin`, admins only)

- **Dashboard:** today's paid orders and revenue (India time), orders waiting to ship, low-stock pieces.
- **Products:** search/filter, add and edit (price in rupees, weight in grams, purity, stones, HUID), quick stock edit, hide/show, images (upload with Cloudinary keys, or pick a placeholder).
- **Orders:** filter by status or search by order number/email; open an order to mark it shipped → delivered, or cancel (stock is put back; refund in Razorpay until Phase 11).
- **Categories:** add, rename, reorder, hide; delete only when empty.

## Customer account (`/account`)

- **Orders:** history and details with a progress bar (confirmed → shipped → delivered).
- **Addresses:** add, edit, delete, choose the default.

## Checkout and payments (Razorpay)

1. Create a Razorpay account → switch to **Test Mode** → **Account & Settings → API Keys → Generate Test Key**.
2. Put the Key ID and Key Secret in `.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) and any long random text in `RAZORPAY_WEBHOOK_SECRET`. Restart `npm run dev`.
3. Add items to the cart → Checkout → add an address → **Pay**. In test mode use UPI ID `success@razorpay` (or a test card from Razorpay's docs).
4. After paying you land on `/orders/<id>/success`; the order is PAID, stock goes down and the cart empties.

Webhooks (`/api/webhooks/razorpay`, events `payment.captured` and `payment.failed`) are registered after deploying in Phase 8 — Razorpay can't reach `localhost`. Locally, the verified checkout callback marks orders as paid.

Emails: set `RESEND_API_KEY` to send real order confirmations; otherwise they're printed in the terminal.

## Cart

- Works without logging in (saved in a cookie); after login it moves into the database and stays across devices.
- Prices and stock are always re-read from the database, so the browser can't change what a customer pays.
- `/cart` shows items, line totals and the subtotal; "Proceed to checkout" asks guests to log in first.

## Tests

```bash
npm test
```

Runs the Vitest unit tests in `tests/`.

## Accounts and login

- `/register` and `/login` — email + password (and Google, if configured).
- `/account` — any signed-in user. `/admin` — admins only (others see "Access denied").
- The seed creates the first admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
- `GET /api/account/me` returns the signed-in user (401 if signed out). `GET /api/admin/me` returns 403 for customers.

### Google login (optional)

1. Go to https://console.cloud.google.com → create a project → **APIs & Services → OAuth consent screen** (External, add your email as a test user).
2. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
3. Authorised redirect URI: `http://localhost:3000/api/auth/callback/google` (add your live domain's version later).
4. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env`, then restart `npm run dev`. The "Continue with Google" button appears automatically.

## Health check

`GET /api/health`

- `200 {"status":"ok","db":"ok"}` — app and database are reachable
- `503 {"status":"error","db":"error"}` — database unreachable (details in the server log)
