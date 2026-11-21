# Admin guide

For the owner and staff. Sign in at `/login` with your staff email, then `/admin`. Staff need two-step sign-in (an authenticator app); keep your recovery codes somewhere safe. You only see the parts of the admin your role allows (Admin → Staff, owner only).

Everything you save is recorded in **Admin → Activity log** with your email and the time.

## Every day

1. **Gold rates** — every morning, before customers start buying, enter today's rates (see "Daily gold rate" below).
2. **Dashboard** — today's orders and revenue, orders waiting to ship, low stock. Read the coloured messages at the top: they tell you if the rates are old or if customers asked to visit the showroom.
3. **Orders** — open each new order:
   - **Prepaid:** status "Paid" → pack it → create the shipment (Shiprocket) or, without a courier account, fill in **Manual delivery tracking** (courier name + AWB). The order becomes "Shipped" and the customer can follow it. Add updates (in transit, out for delivery, delivered) as the courier reports them.
   - **Cash on delivery:** status "Confirmed" → ship the same way → when the courier pays you, record the cash (Admin → Cash on delivery, or upload the courier's remittance sheet in Admin → Accounting).
   - Check the size or other option on each line before you pack.
4. **Visits** — call or WhatsApp new showroom visit requests (see "Showroom visits").
5. **Returns** — approve or reject; approved refunds go back to the customer automatically (Razorpay).
6. **Support** — answer customer messages.
7. **System** — glance: everything green? (See "If something is wrong".)

## Daily gold rate

Admin → **Gold rates**. Anyone who can see products can open it; saving needs permission to edit products.

1. Each box shows the current rate, when it was set, and how many rate-linked pieces use it.
2. Type today's **selling rate per gram** in rupees, e.g. `7250` for 22K. **Per gram, not per 10 grams.** Leave a box empty to keep its rate.
3. Press **Save rates**. Every rate-linked piece (every size of it) is repriced and the website changes straight away. With many pieces this takes a few seconds — wait for the green message.

If the page says some products still show an old price (for example the save was interrupted), press **Reprice now**. It is safe to press more than once.

If a rate moves by more than 15%, the save stops and asks you to check — this usually means the rate per 10 g was typed by mistake. If the rate really is right, tick **Yes, these rates are correct** and save again.

Good to know:

- Customers see the rates in the strip at the top of every page (22K and 24K by default).
- The dashboard warns when a rate is older than 36 hours — including a purity used only by one size (e.g. an 18K size of a 22K ring).
- If the dashboard says **Invoices aren't being created**, the business details in `config/business.ini` are still placeholders. Ask whoever looks after the code to fill them in; then press **Generate invoice** on paid orders that have none.
- Fixed-price pieces never change. Orders already placed keep their price.
- If a sale ("was") price is no longer above the new price, the sale price is removed.
- If the rates are older than 36 hours, the Dashboard warns you. Saving the same rate again is fine: it records that the rate was checked today and clears the warning.
- **Recent changes** at the bottom shows the last 30 rate changes and who made them.

## Products

- **Products → Add product:** name, category, metal, purity, weight in grams, price, HSN and GST rate, photos, HUID. Sizes/colours: open the product → **Variants**.
- **Quick stock edit** on the list; hide a product with the eye button.
- **Many products at once:** Admin → Accounting → Products → **Export all products (CSV)**, edit in Excel / Google Sheets, then **Check file** and **Import**. Nothing is saved unless every row is valid; each problem is listed with its line number.
- **Collections, homepage banners, announcement bar, pages:** Admin → Content (you can schedule start and end times).
- **Coupons:** Admin → Coupons (percentage or fixed, minimum order, usage limits, dates).
- **Find products:** search by name, or filter (e.g. **Low stock**, **Follows metal rate**).

### Fixed price or rate-linked?

Choose under **Pricing** on the product form.

- **Fixed price** — for silver fashion pieces, special offers, pieces with a set price. You type the price (including GST); it never changes on its own.
- **Follows today's metal rate** — for plain gold and most gold jewellery. Don't type a price; fill **Making charge** and **Stone / other charges** instead. The price updates by itself when you save new rates.

How a rate-linked price is worked out, rounded to the nearest rupee:

> (net weight × today's rate per gram + making charge + stone charge) + GST

Example: 4 g of 22K at ₹7,250/g = ₹29,000. Making ₹2,500. No stones. Before GST ₹31,500. GST 3% = ₹945. **Price ₹32,445.**

Things to check for rate-linked pieces:

- The **net weight** must be filled in — on every size, in **Variants**. Each size is priced from its own weight.
- There must be a rate for that purity. If not, the save stops with a message such as "No 22K rate yet". Add the rate first in **Gold rates**.
- Saving the product, its options or its variants works out the price again. Any price you typed for a rate-linked piece is replaced.
- On the product page, customers of single-size rate-linked pieces can open **Price breakup** to see metal, making, stones and GST.

### Occasions

Occasions are **tags**. In the product's **Tags** box, add any that fit: `bridal`, `festive`, `daily wear`, `office wear`, `gift`, `party` (comma-separated; "daily wear" is saved as `daily-wear`).

They power the **Shop by occasion** tiles on the home page, the Occasion filter in the catalogue, the **Style advisor** and the chips on the product page. The starter occasion collections in Admin → Content use the same tags. A piece without these tags never shows up there — tag every piece.

### Sizes and other options

Sizes are **variants**: open the product → **Variants** → set the option (e.g. "Ring size" with values `10, 12, 14, 16`). Each size gets its own SKU, stock, price and weight. The customer must choose one before adding to cart, and the choice shows on the order. Products with options link to the **Size guide** (`/size-guide`) on their page.

### Photos

- Press **Upload a photo** and choose a JPG, PNG or WebP file (up to 5 MB). Wait until "Uploading…" goes away. Add up to 10.
- **The first photo is the main one.** It shows on product cards and at the top of the product page. Change the order with the **←** and **→** buttons next to each photo; remove one with the cross.
- Press **Save changes** to keep the changes.
- If there is no upload button, photo storage is not set up yet. Pick a placeholder image for now and ask whoever looks after the code.

Tips: use a plain light background, good daylight, and the same angle for similar pieces.

### 360° video (optional)

A short, silent video of the piece turning on a turntable. Ask whoever looks after the code to upload the `.mp4` to the shop's photo storage (Cloudinary or Cloudflare R2), then paste its link in **360° video link** and save. Links from other websites (YouTube, Google Drive…) are not accepted. Customers see it as an extra choice in the photo gallery.

### Stock

- Quick change: in the **Products** list, type the new number in the stock box and save it there. Or open the product (or **Variants** for sized pieces).
- **Stock is protected.** If a customer buys the piece while you are editing, the save stops with "Stock changed while you were editing" instead of undoing the sale. Reload and enter the stock again. (The variants grid doesn't have this check yet — avoid editing stock there during busy hours.)
- Pieces in someone's checkout are held for 15 minutes. They come back by themselves if the customer doesn't pay.
- The Dashboard and the **Low stock** filter show pieces with 3 or fewer left. A low-stock email is also sent every morning.

### Renaming, hiding and deleting

- **Changing the URL name is safe.** The old link keeps working and sends customers to the new one.
- **Hide** (eye button, or untick **Visible in store**) — sold out for now, seasonal, not ready yet. Undo with **Show**.
- **Delete** (open the product → bottom → **Delete this product**) — only for a mistake or a test piece that was **never ordered**. Type the product name to confirm. It can't be undone. A piece that was ever ordered can't be deleted (its invoices and returns need it); hide it instead.

## Showroom visits

Customers can ask to visit from the **Book a visit** page (`/visit`) or from any product page ("See it in the showroom"). Needs the Support permission.

1. You get an email, and the Dashboard shows new requests.
2. Admin → **Visits** → **New**. Each request shows the name, phone, email, date, time slot, the piece they want to see and their message.
3. Call or WhatsApp the customer to confirm. The customer gets no automatic email — your call is the confirmation.
4. Set the status and press **Update**: **Confirmed** (time agreed), **Completed** (they came) or **Cancelled**.
5. Use the **Note** box for the team. Customers never see it.

## Showroom details

Admin → **Showroom** (needs the Content permission):

- **Showroom address** and **Opening hours**, e.g. "Monday–Saturday, 10 am – 7 pm; Sunday closed"
- **Showroom phone**
- **WhatsApp number** — used by every "Chat on WhatsApp" button (product page, contact, visit page, help centre, checkout, support tickets). A 10-digit mobile number is fine; `91` is added.
- **Google Maps link** — Google Maps → your shop → **Share** → **Copy link**.

Press **Save**. The website changes at once. The box **Set by the developer** below shows what you can't change here (which features are on, image storage, return days, shipping fee).

## Appearance: festival themes, colours and the top of the home page

Admin → **Appearance** (needs the Content permission). Admin pages never change; only the shop.

- **Everyday** is always on. A **festival theme** (Diwali, wedding season…) takes over between its **Live from** and **Live until** dates (both included, India time) and switches off by itself. If two overlap, the one that started later shows. The list shows each theme as Default, Live now, Scheduled, Hidden by a later theme or Ended.
- **Add a theme** starts from Diwali, Wedding season or a copy of Everyday; change anything, then **Save theme**. The **Festival dates** buttons fill in the dates from `config/marketing.ini`.
- **Colours**: main, gold, background, second background, text, secondary text and a festive accent. Dark mode is worked out from the same colours. A preview shows both modes, and a warning appears if text would be hard to read. **Default colours** puts back Vineet maroon, gold and ivory.
- **Festive decoration**: none, a marigold toran under the header, or scattered petals behind the top of the home page.
- **Top of the home page**: a photo in an arch with the text beside it, or a full-width background video. Upload a photo (or pick one of ours) and describe it. For a video, upload an MP4 or WebM (up to `[images] max_video_mb`, 25 MB; it goes straight to Cloudinary) or paste a link to one on our storage. The video plays muted on a loop; shoppers who ask for less motion or save data see the photo. Then the small line, heading (_stars_ make words italic), text, button label and the page the button opens (a page on this site, starting with `/`).
- **Offer bar**: a line above the header while the theme is live (_stars_ show words in gold). An announcement from Content → Announcements shows instead whenever one is live.
- **Preview on the site** opens the home page with that theme's colours and top section, even before its dates (the link works for 48 hours).
- **Light or dark for new visitors**: follow the phone's setting (default), light or dark. Shoppers can always switch with the sun/moon button in the header; the shop remembers their choice.

A home-page hero section in Content → Home sections, when one is live, replaces the theme's top section.

## Popup

Admin → **Appearance** → **Popup** (needs the Content permission). A popup with a picture, a few words and one thing to do. It is **off** until you tick **Show the popup**.

- **When**: optional From/Until dates (India time), the home page only or every shop page, when it opens (after 4, 8 or 20 seconds, or when someone on a computer heads for the address bar), and how often the same shopper sees it again (once a day, week, month, or only once). It never opens on cart, checkout, sign-in, account or admin pages. Every save counts as a new popup, so shoppers who closed the old one see the new one.
- **Picture and words**: upload a picture (or pick one of ours) and describe it, then the small line, heading (_stars_ make words italic) and text.
- **What it asks for**:
  - **Book a showroom visit**: name, mobile, one of the next five days and a time. Requests appear in Admin → **Visits**, like the visit page.
  - **Join the newsletter**: email and consent; the usual confirmation email is sent (double opt-in).
  - **Sign in or create an account**: not shown to shoppers who are already signed in.
  - **Just a button** to a page on this site.
- The preview on the right updates as you type (tick **Phone width** for the phone layout).

## Home-page category tiles

The home page shows each category as a piece "worn" on a velvet display model (a bust, a head or a hand, drawn in the shop's colours). Hovering, or tapping on a phone, brings the full product photo up from where the piece sits. Until you set your own, categories whose names mention earrings, rings, necklaces, chains, mangalsutra or bangles show a sample tile made from stock photos; any other category shows its plain photo.

Admin → **Categories** → open **Home-page tile** under a category (needs the product edit permission):

1. Choose the **Display model**: bust (necklaces, chains, mangalsutra), head (earrings, shown on both ears), hand (rings, bangles), **our own model photo**, or **no model** (just the category photo).
2. **Product photo**: upload one photo of the piece. Its background is removed in your browser, so it works best for a single piece photographed from the front on a plain, even background. If you already have a PNG with a transparent background, tick the box first. The photo itself becomes the hover photo.
3. **Drag** the piece on the model to place it (or click it and use the arrow keys; hold Shift for bigger steps). Use **Size** and **Turn** to fit it.
4. **Show the hover photo** previews the zoom. You can upload a different **Hover photo** and describe it for screen readers.
5. **Save tile**. **Back to the sample tile** undoes your tile.

With **our own model photo**, upload a portrait (3:4) photo of a model wearing the piece; no cut-out is drawn on it.

## Money and tax

- **Admin → Accounting → GST reports:** pick the month → download the sales register, B2CS summary, HSN summary and refunds (credit notes) for your CA. The page says whether the totals match the invoices.
- **Reconciliation:** upload Razorpay's settlement report (Razorpay → Reports → Settlement recon) or the courier's COD remittance sheet. Each line is matched to an order; differences are listed with a reason. COD orders that match can be marked "cash received" in one click.
- **Reports:** sales, refunds, top products, download orders as CSV.
- **Refunds the shop makes by itself** (for example a customer paid after their stock hold ran out and the last piece was sold, or someone paid twice) are normal. Never refund the same order again in the Razorpay dashboard.

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

Shop name, shipping fee, COD limits, return window, business and grievance details, and which features are on are in the `config/` folder (ask whoever looks after the code; every change is a deploy — see `CONFIGURATION.md`). Today's gold rates and showroom details are yours to change in the admin. Secrets (payment keys etc.) are in Vercel, never in files.
