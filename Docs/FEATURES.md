# Features — how the store behaves

What each feature does from the customer's and admin's point of view. Where the code lives: `learning/02-feature-map.md`. Setup of external services: `INTEGRATIONS.md`. Step-by-step for the shop team: [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md).

## Catalog

- `/products` — all active jewellery, 12 per page. Filters and sorting live in the URL, e.g. `/products?category=rings&metal=GOLD&sort=price_asc`.
- `/products?q=jhumka` — search by name (the header search box uses this).
- `/products/<slug>` — product details: photos (+ optional 360° video), price, stock, metal, purity, weight, stones, hallmark, occasions, return window.
- **Renamed pieces keep their old links:** when an admin changes a product's URL name, the old address permanently redirects (308) to the new one, so shared links and Google results don't break.
- Catalog pages are cached for 5 minutes; admin edits refresh them instantly.

## Gold rate and prices

- **Rate strip:** the thin strip at the top of the header shows today's rates per gram (e.g. `Today's rate 22K ₹7,250/g · 24K ₹7,900/g (updated 18 Nov, 10:15 am)`) for the purities in `[pricing] strip_purities`, next to the standing `[storefront] announcement` message on wide screens. With no rates yet, or `[features] rate_strip = false`, it shows only the message. Time-limited offers go in the scheduled announcement bar (Admin → Content), which shows above the strip.
- **Two kinds of price**, chosen per product by the admin:
  - **Fixed price** — the price typed by the admin. Never changes on its own.
  - **Follows today's metal rate** (rate-linked) — `(net weight in g × today's rate for its purity + making charge + stone charge) × (1 + GST)`, rounded to the whole rupee (`lib/metal-pricing.ts`). **Every size (variant) is priced from its own net weight.** Recalculated and stored the moment an admin saves new rates (or saves the product, its options or its variants), so lists, filters, cart and checkout all read one stored price. A sale ("was") price that is no longer above the new price is removed.
- **Price breakup** on the product page of single-size rate-linked pieces ("Price breakup (today's 22K rate ₹7,250/g)"): metal, making charge, stones, GST (incl. rounding) and total. Shown only when it adds up exactly to the price charged.
- A customer paying while the rate changes is never charged a surprise price: checkout sees the price changed and asks them to review their cart ("A price just changed").
- Each order item keeps a snapshot of how it was priced (`pricingMode`), so later rate changes never touch past orders or invoices.

## Occasions, filters and style advisor

- Occasions are **product tags**: `bridal`, `festive`, `daily-wear`, `office-wear`, `gift`, `party` (shown as Bridal, Festive, Daily wear, Office wear, Gifting, Party) — the same tags the starter occasion collections use. Admins add them in the product's **Tags** box. Occasion chips on the product page link to `/products?occasion=<tag>`.
- Home page: **Shop by occasion** tiles (one per occasion) and a link to the style advisor.
- `/style-advisor` — four optional questions (occasion, type of jewellery, colour, budget). Works without JavaScript. **Show my picks** redirects to `/products` with those filters, in stock only, sorted by top rated. Off with `[features] style_advisor = false` (then 404).

## Search and SEO

- The header search suggests pieces while you type and copes with spelling mistakes ("jumka" → Traditional Jhumka). Press Enter for all results.
- `/products` filters: category, metal, purity, **occasion**, **colour** (yellow, white, rose, silver), price range, **net weight range (g)**, in stock only, rating; sort by best match, newest, price or top rated. Example: `/products?occasion=daily-wear&colour=ROSE&minWeight=2&maxWeight=5`.
- **Budget chips** above the list — Under ₹10,000 · ₹10,000–₹25,000 · ₹25,000–₹50,000 · ₹50,000–₹1,00,000 · Above ₹1,00,000. One tap sets the price range; tap again to clear.
- Filtered lists are marked `noindex`, so Google indexes only the main pages.
- Category landing pages at `/collections/<category>`; `sitemap.xml` (also lists `/size-guide`, and `/visit` and `/style-advisor` when switched on) and `robots.txt` are generated automatically — submit `https://<your-domain>/sitemap.xml` in Google Search Console after going live.

## Cart

- Works without logging in (saved in a cookie); after login it moves into the database and stays across devices.
- Prices and stock are always re-read from the database, so the browser can't change what a customer pays.
- `/cart` shows items (with the chosen size or option), line totals and the subtotal; "Proceed to checkout" asks guests to log in first.

## Sizes

- Sizes are **variants** (Phase 17): each size has its own SKU, stock, price and weight. The customer picks one before **Add to cart**.
- `/size-guide` — Indian ring sizes (inner circumference and diameter in mm) and bangle sizes (inches → mm), with how to measure. Linked from product pages that have options, and from the footer.

## WhatsApp and showroom visits

- **Chat on WhatsApp** buttons (product page, contact, visit page, help centre, checkout, support tickets) all use one number: the one in Admin → Showroom, else `[support] whatsapp_number` in `config/customer.ini`. A bare 10-digit number gets `91` added. Hidden when there is no number or `[features] whatsapp_button = false`.
- **Book a showroom visit** — `/visit` (also "See it in the showroom" on each product page, a home page invite, the footer and the size guide). Name, mobile (10-digit Indian), optional email, date (today up to 60 days ahead, India time), slot (Morning 10–1, Afternoon 1–4, Evening 4–7) and an optional message. Guests can book too. Limit: 5 requests per hour per IP; a hidden bot trap silently drops spam.
- The shop gets an email ("Showroom visit request: <date>, <slot>") at `[alerts] admin_email` or every admin; details are in **Admin → Visits**. The customer gets no automatic email — the shop calls or WhatsApps them to confirm.
- **Contact page** shows the showroom address (with a Google Maps link), opening hours, showroom phone and WhatsApp from Admin → Showroom; legal details still come from `config/business.ini`.
- Off with `[features] visit_booking = false` (then `/visit` is 404).

## Coupons and wishlist

- Admin → **Coupons**: percent or flat discounts, minimum order, maximum discount, start/end dates, total and per-customer limits. Customers enter codes at checkout (any case).
- Customers tap **Save** on a product to add it to **Account → Wishlist**, then **Move to cart** when ready.

## Reviews

- Customers whose order was delivered can review the piece (stars, title, text, optional photos) from the product page or their order page. Photos must be uploaded with the button; links to other sites are refused.
- Admin → **Reviews**: publish, reject or unpublish (with a reason the customer sees). Only published reviews count towards the star rating shown on products.
- Home page: **What our customers say** — the newest published 4–5 star reviews (`[storefront] home_reviews`; 0 hides it).

## Cancellations, returns and refunds

- **Cancel:** customers and admins can cancel a paid order until a courier shipment exists (a Shiprocket shipment or AWB that wasn't cancelled at the courier). After that the customer sees "Your order is already packed for the courier. Please contact us to cancel." and the admin is told to cancel the Shiprocket shipment first. On cancel, stock goes back and a full refund is sent through Razorpay automatically. A cancel and a shipment created at the same moment can't both go through unnoticed.
- **Return:** within `[returns] window_days` (default 7) of delivery, customers choose pieces, a reason and an optional photo (uploaded with the button). `window_days = 0` turns returns off. Admin → **Returns** → open the order → approve (optionally restock) or reject with a reason.
- **Refunds:** sent through Razorpay's API; confirmed by the `refund.processed` webhook (add the events `refund.processed` and `refund.failed` to your Razorpay webhook). Failed refunds — and refunds stuck for 10+ minutes without reaching Razorpay — show a **Retry** button. A retry never pays twice: Razorpay is asked first whether the refund already exists.
- **Sold out after payment:** if a customer pays after their stock hold expired and the last piece sold meanwhile, the order goes to "Refund pending" and a full refund is created in the same step. The page says "Your payment will be refunded in full".
- **Extra payments are never kept:** a second captured payment for an order that is already paid, or a payment for a cancelled order, is recorded and refunded in full automatically (checkout says "This order was already cancelled, so we're refunding that payment in full").
- Refunds that a crash left unsent are sent by the stock-hold cron job.
- Customers get an email at every step.

## GST invoices and emails

- Set `gstin`, `state` (e.g. Telangana) under `[business]` and `prefix` under `[invoice]` in `config/business.ini`. Same-state customers get CGST + SGST, others IGST. Invoices use the tax split saved at checkout, so changing `state` later never changes old orders.
- Each product has an HSN code and GST rate (Admin → Products → edit). Prices include GST.
- A tax invoice (`INV/2026-27/000001`) is created when an order is paid; customers download it from their order page, admins from the order in `/admin`. Older paid orders: **Generate invoice**.
- **No invoice while business details are placeholders** (`[GSTIN]` etc.): no invoice number is used up. Fill them in, deploy, then press **Generate invoice**.
- Customers get emails when an order is confirmed, shipped, delivered, cancelled or refunded. Set `RESEND_API_KEY` to send them for real.

## Customer account (`/account`)

- **Orders:** history and details with a progress bar (confirmed → shipped → delivered).
- **Addresses:** add, edit, delete, choose the default.

## Accounts and login

- `/register` and `/login` — email + password (and Google, if configured).
- Too many wrong passwords are blocked for 15 minutes: 5 per email from one IP, 30 per IP, and 20 per account from any IP.
- After login the customer returns to the page they came from; only addresses on our own site are allowed (`lib/safe-redirect.ts`).
- The payment-failed page never shows text from the URL.
- `/account` — any signed-in user. `/admin` — admins only (others see "Access denied").
- The seed creates the first admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. It only **creates** missing rows (never overwrites edited products or categories) and refuses to run against production unless `SEED_ALLOW_PROD=1`.
- `GET /api/account/me` returns the signed-in user (401 if signed out). `GET /api/admin/me` returns 403 for customers.

Google login setup: `INTEGRATIONS.md`.

## Admin panel (`/admin`, admins only)

- **Dashboard:** today's paid orders and revenue (India time), orders waiting to ship, low-stock pieces (threshold: `[inventory] low_stock_threshold`). Warnings on top: "Metal rates are older than 36 hours…" (a purity used by rate-linked products has no rate or an old one; `[pricing] stale_after_hours`) and "N new showroom visit requests".
- **Returns, Coupons, Reviews, Reports, Activity log:** see the sections above.
- **Products:** search/filter (incl. **Low stock** and **Follows metal rate**), add and edit: name, URL name, description, category, stock, metal, purity, colour, weights, HUID, stones, **fixed or rate-linked price**, making and stone charge, HSN, GST, **tags** (incl. occasions), returnable, visible, featured; sizes and other options under **Variants**. Photos: upload (Cloudinary or R2, see `[images] provider`) or pick a placeholder, **reorder** (first = main photo) and remove; up to 10. Optional **360° video link** (.mp4/.webm from our Cloudinary/R2, or a `/videos/…` path).
  - **Stock-overwrite protection:** the edit form and the quick stock box send the stock shown when they were opened; if a piece sold meanwhile, the save is refused ("Stock changed while you were editing (now N)…") instead of silently undoing the sale. (The variant grid doesn't check this yet — BACKLOG BL-19.)
  - **Delete** (bottom of the edit page; type the name to confirm) only for pieces that were **never ordered**. Ordered pieces can only be hidden.
  - Changing the URL name keeps the old one (last 20) for redirects; a new URL name can't take another product's old one.
- **Gold rates** (`/admin/rates`; viewing needs `products.view`, saving `products.edit`): one box per purity (24K, 22K, 18K, 14K, 925 silver, PT950) in ₹ per gram, with the current rate, when it was set and how many rate-linked pieces use it. Empty boxes keep the current rate. Saving reprices every variant of every rate-linked piece of the changed purities **in one transaction** and reports "Saved. N rate-linked prices updated." A change of more than `[pricing] large_change_percent` (15%) needs the tick box "Yes, these rates are correct" (catches a rate per 10 g typed by mistake). The last 30 changes are listed with who made them; every save is in the Activity log.
- **Visits** (`/admin/visits`, needs `support.manage`): requests sorted by preferred date; filter New / Confirmed / Completed / Cancelled; tap-to-call phone, product asked about, message; change the status and add a private note.
- **Showroom** (`/admin/settings`, needs `content.manage`): showroom address, opening hours, showroom phone, WhatsApp number, Google Maps link — live on the site at once. Also shows (read-only) the switches and values the developer sets in `config/`.
- **Orders:** filter by status or search by order number/email; open an order to create a shipment, mark it shipped → delivered, or cancel before a courier shipment exists (stock is put back and a full refund is sent automatically). The size or option is shown next to each item.
- **Categories:** add, rename, reorder, hide; delete only when empty. Leaving the URL name empty while editing keeps the current one, so renaming never breaks `/collections/…` links; a form without a description box (e.g. quick edits) never wipes the description.

## Accounting and integrations (Phase 29)

- Admin → **Accounting** (permission `accounting.manage`):
  - **GST reports** for any month: sales register, B2CS summary by place of supply and rate (GSTR-1 table 7), HSN summary (table 12), refunds / credit notes (tax split in proportion). Built from the invoices, with a check that the totals match. Have a CA check the first filing.
  - **Reconciliation:** upload Razorpay's settlement report or a courier's COD remittance sheet. Every line is matched to an order; differences are listed (amount differs, unknown payment, not settled, cash overdue…). COD lines that match can be recorded as received in one click. With Razorpay keys set, yesterday's settlement is also checked every day.
  - **Products CSV:** export all products, edit in a spreadsheet, import. Same rules as the product form; "Check file" first; nothing is saved unless every row is valid (up to 2,000 rows).
- Admin → **Integrations** (permission `integrations.manage`):
  - **Products API** (read-only): `GET /api/v1/products` and `/api/v1/products/<slug>` with `Authorization: Bearer sk_live_…`; 120 requests a minute per key; only visible products, no costs or customer data. Keys are shown once and stored hashed; revoke any time.
  - **Webhooks:** POST a JSON event to your https address when an order is confirmed, shipped, delivered, cancelled or refunded, signed with `X-Store-Signature: t=…,v1=HMAC-SHA256(secret, "t.body")`. Private / local addresses are refused. Failed deliveries retry (Admin → Jobs).
- Buyer name, phone, email and address on invoices are now encrypted like saved addresses (`npm run pii:encrypt` also converts old invoices).

## Accessibility and polish (Phase 28)

- Checked with axe (WCAG 2.1 A/AA) on the home, collection, product, search, cart, login, register, contact, not-found, checkout and main admin pages: no violations. The whole purchase works with the keyboard alone. Both are automated browser tests.
- Address forms fill in the **State from the pincode** (India Post ranges, built in — no outside service). Pincodes shared by two states are left for the customer; a state they chose is never changed.
- On phones, **Add to cart** stays at the bottom of the screen (with the price) once the main button scrolls away.
- Loading placeholders on the product list (they respect "reduce motion"). Not on product, collection or account pages: there they would make missing pages answer 200 instead of 404.

## Kill switches and launch (Phase 30)

- Admin → **System → Kill switches** (permission `switches.manage`, Owner and Manager): pause **Checkout**, **Cash on delivery**, **Coupons** or **Recommendation rows** within seconds, with an optional reason. Enforced on the server; customers see a short "paused" message; every change is in the activity log.
- `npm run backup:drill`: backs up, restores into a fresh database, compares every table, prints timings (`Docs/BACKUPS.md`).
- Guides: `Docs/ADMIN_GUIDE.md` (owner and staff), `Docs/ONBOARDING.md` (developers), `Docs/LAUNCH.md` (soft launch, first 24 hours, rollback).

## Reports, activity log and analytics

- Admin → **Reports**: orders, gross/net sales, refunds, average order, revenue by day and week, top products, shopping funnel, low stock, **Download CSV**.
- Admin → **Activity log**: who changed what and when (now also rate changes, showroom settings, visit status, product deletes).
- Set `NEXT_PUBLIC_GA_ID` for Google Analytics 4; it only loads after a shopper accepts the cookie banner.
- Backups: see `Docs/BACKUPS.md`.

## Health check

`GET /api/health`

- `200 {"status":"ok","db":"ok"}` — app and database are reachable
- `503 {"status":"error","db":"error"}` — database unreachable (details in the server log)
