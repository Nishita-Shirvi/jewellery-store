# Features — how the store behaves

What each feature does from the customer's and admin's point of view. Where the code lives: `learning/02-feature-map.md`. Setup of external services: `INTEGRATIONS.md`.

## Catalog

- `/products` — all active jewellery, 12 per page. Filters and sorting live in the URL, e.g. `/products?category=rings&metal=GOLD&sort=price_asc`.
- `/products?q=jhumka` — search by name (the header search box uses this).
- `/products/<slug>` — product details: price, stock, metal, purity, weight, stones, hallmark.
- Catalog pages are cached for 5 minutes; admin edits refresh them instantly.

## Search and SEO

- The header search suggests pieces while you type and copes with spelling mistakes ("jumka" → Traditional Jhumka). Press Enter for all results.
- `/products` filters: category, metal, purity, price range, in stock only, rating; sort by best match, newest, price or top rated.
- Category landing pages at `/collections/<category>`; `sitemap.xml` and `robots.txt` are generated automatically — submit `https://<your-domain>/sitemap.xml` in Google Search Console after going live.

## Cart

- Works without logging in (saved in a cookie); after login it moves into the database and stays across devices.
- Prices and stock are always re-read from the database, so the browser can't change what a customer pays.
- `/cart` shows items, line totals and the subtotal; "Proceed to checkout" asks guests to log in first.

## Coupons and wishlist

- Admin → **Coupons**: percent or flat discounts, minimum order, maximum discount, start/end dates, total and per-customer limits. Customers enter codes at checkout (any case).
- Customers tap **Save** on a product to add it to **Account → Wishlist**, then **Move to cart** when ready.

## Reviews

- Customers whose order was delivered can review the piece (stars, title, text, optional photos) from the product page or their order page.
- Admin → **Reviews**: publish, reject or unpublish (with a reason the customer sees). Only published reviews count towards the star rating shown on products.

## Cancellations, returns and refunds

- **Cancel:** customers cancel paid orders that aren't packed yet (Account → Orders → Cancel order); admins can cancel any paid order. Stock goes back and a full refund is sent through Razorpay automatically.
- **Return:** within 7 days of delivery (`RETURN_WINDOW_DAYS` in `lib/returns.ts`), customers choose pieces, a reason and an optional photo. Admin → **Returns** → open the order → approve (optionally restock) or reject with a reason.
- **Refunds:** sent through Razorpay's API; confirmed by the `refund.processed` webhook (add the events `refund.processed` and `refund.failed` to your Razorpay webhook). Failed refunds show a **Retry** button.
- Customers get an email at every step.

## GST invoices and emails

- Set `gstin`, `state` (e.g. Telangana) under `[business]` and `prefix` under `[invoice]` in `config.ini`. Same-state customers get CGST + SGST, others IGST.
- Each product has an HSN code and GST rate (Admin → Products → edit). Prices include GST.
- A tax invoice (`INV/2026-27/000001`) is created when an order is paid; customers download it from their order page, admins from the order in `/admin`. Older paid orders: **Generate invoice**.
- Customers get emails when an order is confirmed, shipped, delivered, cancelled or refunded. Set `RESEND_API_KEY` to send them for real.

## Customer account (`/account`)

- **Orders:** history and details with a progress bar (confirmed → shipped → delivered).
- **Addresses:** add, edit, delete, choose the default.

## Accounts and login

- `/register` and `/login` — email + password (and Google, if configured).
- `/account` — any signed-in user. `/admin` — admins only (others see "Access denied").
- The seed creates the first admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
- `GET /api/account/me` returns the signed-in user (401 if signed out). `GET /api/admin/me` returns 403 for customers.

Google login setup: `INTEGRATIONS.md`.

## Admin panel (`/admin`, admins only)

- **Dashboard:** today's paid orders and revenue (India time), orders waiting to ship, low-stock pieces (threshold: `[inventory] low_stock_threshold`).
- **Returns, Coupons, Reviews, Reports, Activity log:** see the sections above.
- **Products:** search/filter, add and edit (price in rupees, weight in grams, purity, stones, HUID), quick stock edit, hide/show, images (upload with Cloudinary keys, or pick a placeholder).
- **Orders:** filter by status or search by order number/email; open an order to create a shipment, mark it shipped → delivered, or cancel (stock is put back and a full refund is sent automatically).
- **Categories:** add, rename, reorder, hide; delete only when empty.

## Reports, activity log and analytics

- Admin → **Reports**: orders, gross/net sales, refunds, average order, revenue by day and week, top products, shopping funnel, low stock, **Download CSV**.
- Admin → **Activity log**: who changed what and when.
- Set `NEXT_PUBLIC_GA_ID` for Google Analytics 4; it only loads after a shopper accepts the cookie banner.
- Backups: see `Docs/BACKUPS.md`.

## Health check

`GET /api/health`

- `200 {"status":"ok","db":"ok"}` — app and database are reachable
- `503 {"status":"error","db":"error"}` — database unreachable (details in the server log)
