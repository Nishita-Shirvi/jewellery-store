# Admin guide

For the owner and staff. Sign in at `/login` with your staff email, then `/admin`. Staff need two-step sign-in (an authenticator app); keep your recovery codes somewhere safe. You only see the parts of the admin your role allows (Admin → Staff, owner only).

## Every day

1. **Dashboard** — today's orders and revenue, orders waiting to ship, low stock.
2. **Orders** — open each new order:
   - **Prepaid:** status "Paid" → pack it → create the shipment (Shiprocket) or, without a courier account, fill in **Manual delivery tracking** (courier name + AWB). The order becomes "Shipped" and the customer can follow it. Add updates (in transit, out for delivery, delivered) as the courier reports them.
   - **Cash on delivery:** status "Confirmed" → ship the same way → when the courier pays you, record the cash (Admin → Cash on delivery, or upload the courier's remittance sheet in Admin → Accounting).
3. **Returns** — approve or reject; approved refunds go back to the customer automatically (Razorpay).
4. **Support** — answer customer messages.
5. **System** — glance: everything green? (See "If something is wrong".)

## Products

- **Products → Add product:** name, category, metal, purity, weight in grams, price in rupees, HSN and GST rate, photos, HUID. Sizes/colours: open the product → **Variants**.
- **Quick stock edit** on the list; hide a product with the eye button (never delete products that have orders).
- **Many products at once:** Admin → Accounting → Products → **Export all products (CSV)**, edit in Excel / Google Sheets, then **Check file** and **Import**. Nothing is saved unless every row is valid; each problem is listed with its line number.
- **Collections, homepage banners, announcement bar, pages:** Admin → Content (you can schedule start and end times).
- **Coupons:** Admin → Coupons (percentage or fixed, minimum order, usage limits, dates).

## Money and tax

- **Admin → Accounting → GST reports:** pick the month → download the sales register, B2CS summary, HSN summary and refunds (credit notes) for your CA. The page says whether the totals match the invoices.
- **Reconciliation:** upload Razorpay's settlement report (Razorpay → Reports → Settlement recon) or the courier's COD remittance sheet. Each line is matched to an order; differences are listed with a reason. COD orders that match can be marked "cash received" in one click.
- **Reports:** sales, refunds, top products, download orders as CSV.

## Other systems

**Admin → Integrations:**

- **API keys** let another system read your product catalogue (for example a marketplace feed). The key is shown once; revoke it if it leaks.
- **Webhooks** send order events to another system's address. Copy the signing secret when it's shown.

## If something is wrong

**Admin → System** shows health, alerts and the cron. Each alert names a section in `RUNBOOK.md`.

**Kill switches** (Admin → System): pause **Checkout**, **Cash on delivery**, **Coupons** or **Recommendation rows** instantly. Use them when, for example, a price is wrong, a coupon is being abused, or fake COD orders come in. Customers see a short "paused" message and their carts are kept. Add a reason so others know why; turn it back on when it's fixed. Every change is in Admin → Activity log.

**Admin → Jobs:** emails, invoices and similar tasks that failed. Press Retry after fixing the cause.

## Staff

Admin → Staff (owner): invite people by email and give them a role — Manager, Order manager, Catalog editor or Support (or make your own). Remove access the day someone leaves. Lost phone and recovery codes: whoever looks after the code runs `npm run staff:reset-2fa -- their@email` (`RUNBOOK.md` → "Rotating keys" has the related steps).

## Settings

Shop name, shipping fee, COD limits, return window, business and grievance details are in `config.ini` (ask whoever looks after the code; every change is a deploy). Secrets (payment keys etc.) are in Vercel, never in files.
