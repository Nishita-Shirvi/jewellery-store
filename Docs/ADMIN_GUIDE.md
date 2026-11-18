# Admin guide — running the shop day to day

This guide is for the shop team. It shows how to do each job in the admin panel, step by step.

Open the admin panel at `https://<your-shop>/admin`. Log in with an admin account. The menu at the top has: **Dashboard, Orders, Returns, Products, Gold rates, Categories, Coupons, Reviews, Visits, Settings, Activity log**.

Everything you save is recorded in **Activity log** with your email and the time.

---

## Your daily routine

1. **Morning: update the gold rate.** Admin → **Gold rates**. (See [Daily gold rate](#daily-gold-rate).)
2. **Open the Dashboard.** Read the coloured messages at the top. They tell you if the rates are old or if customers asked to visit.
3. **Ship new orders.** Admin → **Orders** → filter **Paid**.
4. **Answer visit requests.** Admin → **Visits** → **New**.
5. **Check returns and reviews.** Admin → **Returns** and **Reviews**.

---

## Products

### Add a new product

1. Go to **Products** → **Add product**.
2. **Basics**
   - **Name**: the name customers see, e.g. "Lakshmi Temple Jhumka".
   - **URL name**: leave empty. It is made from the name.
   - **Description**: a few lines about the piece.
   - **Category**: e.g. Earrings.
   - **Stock (pieces)**: how many you have.
3. **Metal and weight**
   - Choose **Metal**, **Purity** (22K, 18K…) and **Colour**.
   - **Net weight (g)**: the metal weight, up to 3 decimals, e.g. `4.125`.
   - **Gross weight**: optional (metal + stones).
   - **BIS HUID**: the 6-character hallmark code, if any.
   - **Stones**: optional, e.g. "Kundan, ruby".
4. **Price and tax** — choose one:
   - **Fixed price**: type the final price in rupees, including GST.
   - **Follows today's metal rate**: do not type a price. Fill **Making charge** and **Stone charge** instead. The shop works out the price from today's rate. (See [Fixed price or rate-linked?](#fixed-price-or-rate-linked).)
   - **HSN code** and **GST rate**: for jewellery usually `7113` and `3`. Ask your CA if unsure.
5. **Occasions**: tick every occasion that fits (Bridal, Festive, Daily wear, Office wear, Gifting, Party). (See [Occasions](#occasions).)
6. **Sizes**: only for rings, bangles and other sized pieces. (See [Sizes](#sizes).)
7. **Photos and video**: add at least one photo. (See [Photos](#photos).)
8. **Options**
   - **Visible in store**: tick to show it to customers.
   - **Featured on home page**: tick to show it on the home page.
   - **Returnable**: untick for pieces that can't be returned (e.g. made to order).
9. Press **Create product**.

If something is wrong, the box turns red with a short message. Fix it and save again. What you typed is kept.

### Edit a product

1. Go to **Products**. Search by name, or use the filter (e.g. **Low stock**, **Follows metal rate**).
2. Click the product name.
3. Change what you need. Press **Save changes**.

Good to know:

- **Changing the URL name is safe.** The old link keeps working. It sends customers to the new one.
- **Stock is protected.** If a customer buys the piece while you are editing, and you also changed the stock, the save stops with "Stock changed while you were editing (now N)". Reload the page and enter the stock again. If you didn't touch the stock box, nothing happens to the stock.

### Fixed price or rate-linked?

| Use…                           | When                                                           | What happens when the gold rate changes              |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------- |
| **Fixed price**                | Silver fashion pieces, special offers, pieces with a set price | Nothing. The price stays as you typed it.            |
| **Follows today's metal rate** | Plain gold and most gold jewellery                             | The price updates by itself when you save new rates. |

How a rate-linked price is worked out:

> (net weight × today's rate per gram + making charge + stone charge) + GST, rounded to the nearest rupee.

Example: 4 g of 22K at ₹7,250/g = ₹29,000. Making ₹2,500. No stones. Total before GST ₹31,500. GST 3% = ₹945. **Price ₹32,445.**

Things to check for rate-linked pieces:

- The **net weight** must be filled in.
- There must be a rate for that purity. If not, the save stops with "No 22K rate yet". Add the rate first in **Gold rates**.
- The price box shows "Calculated on save". After saving, the list shows the new price with "Follows rate" under it.
- On the product page, customers can open **Price breakup** to see metal, making, stones and GST.

### Photos

- Press **Upload a photo** and choose a JPG, PNG or WebP file (up to 5 MB). Wait until "Uploading…" goes away.
- Add more photos the same way. Up to 10.
- **The first photo is the main one.** It shows on product cards and at the top of the product page.
- **Change the order** with the arrow buttons next to each photo (earlier / later).
- **Remove** a photo with the cross button.
- Press **Save changes** to keep the changes.
- If there is no upload button, photo storage is not set up yet. You can pick a placeholder image for now. Ask your developer.

Tips: use a plain light background, good daylight, and the same angle for similar pieces.

### 360° video (optional)

A short, silent video of the piece turning on a turntable.

1. Ask your developer (or whoever manages Cloudinary / Cloudflare) to upload the `.mp4` file.
2. Copy its link.
3. Paste it in **360° video link** and press **Save changes**.

Links from other websites (YouTube, Google Drive…) are not accepted.

### Sizes

- Type the sizes separated by commas, e.g. `10, 12, 14, 16` for rings or `2.4, 2.6, 2.8` for bangles.
- Leave it empty for one-size pieces (earrings, pendants).
- When sizes are set, the customer must choose one before adding to cart.
- **Stock is shared by all sizes.** If stock is 2, customers can buy 2 in total, in any sizes. The workshop sizes each piece.
- The chosen size shows on the order. Check it before you pack.
- Customers can read the **Size guide** (`/size-guide`) to find their size.

### Occasions

- Tick the occasions that fit the piece.
- They power the **Shop by occasion** tiles on the home page, the occasion filter and the **Style advisor** quiz.
- A piece with no occasions never shows up there. Tag every piece.

### Stock

- Quick change: in the **Products** list, type the new number in the stock box and save it there.
- Or open the product and change **Stock (pieces)**.
- Pieces in someone's checkout are held for 15 minutes. They come back by themselves if the customer doesn't pay.
- The **Dashboard** and the **Low stock** filter show pieces with 3 or fewer left. A low-stock email is also sent every morning.

### Hide or delete?

| Action     | Where                                                     | Use it when                                          | Can you undo it?     |
| ---------- | --------------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| **Hide**   | Products list → **Hide** (or untick **Visible in store**) | Sold out for now, seasonal, not ready yet            | Yes — press **Show** |
| **Delete** | Open the product → bottom → **Delete this product**       | A mistake or a test piece that was **never ordered** | **No**               |

To delete, type the product name exactly to confirm, then press **Delete product**. A piece that was ever ordered can't be deleted (its invoices and returns need it). Hide it instead.

---

## Daily gold rate

Do this every morning, before customers start buying.

1. Go to **Gold rates**.
2. Each box shows the current rate and when it was set, and how many rate-linked pieces use it.
3. Type today's **selling rate per gram** in rupees, e.g. `7250` for 22K.
   - **Per gram, not per 10 grams.**
   - Leave a box empty to keep its rate.
4. Press **Save rates**.
5. You see "Saved. N rate-linked prices updated." The prices on the website change straight away.

If a rate changed by more than 15%, the save stops and asks you to check. This usually means the rate per 10 g was typed by mistake. If the rate really is right, tick **Yes, these rates are correct** and save again.

Good to know:

- The rates show to customers in the bar at the top of every page (22K and 24K by default).
- Fixed-price pieces never change.
- Orders already placed keep their price.
- A customer who is paying at that moment is asked to check their cart. They are never charged a different price by surprise.
- If you don't update for 36 hours, the **Dashboard** shows "Metal rates are older than 36 hours". Typing the same rate as before does not count as an update — nothing is saved when no rate changed.
- **Recent changes** at the bottom shows the last 30 rate changes and who made them.

---

## Showroom visits

Customers can ask to visit the showroom from the **Book a visit** page or from any product page ("See it in the showroom").

1. You get an email: "Showroom visit request: <date>, <time>".
2. Go to **Visits**. New requests are under **New**. They are sorted by the date the customer chose.
3. Each request shows the name, phone (tap to call), email, date, time slot, the piece they want to see and their message.
4. Call or WhatsApp the customer to confirm.
5. Choose the new status and press **Update**:
   - **Confirmed** — you agreed a time.
   - **Completed** — they came.
   - **Cancelled** — they can't come, or it was not a real request.
6. Use the **Note** box for anything the team should know. Customers never see it.

The customer does not get an automatic email. Your call or message is the confirmation.

---

## Settings

Go to **Settings** to change what customers see about the showroom:

- **Showroom address**
- **Opening hours**, e.g. "Monday–Saturday, 10 am – 7 pm; Sunday closed"
- **Showroom phone**
- **WhatsApp number** — powers the **Ask on WhatsApp** button. A 10-digit mobile number is fine. Leave it empty to hide the button.
- **Google Maps link** — Google Maps → your shop → **Share** → **Copy link**.

Press **Save**. The contact page, the visit page and the WhatsApp button change at once.

The box **Set by the developer** below shows things you can't change here: legal name and GST details, shipping fee, return days, and which features are on. Ask your developer to change those.

---

## Orders

### Ship an order

1. Go to **Orders**. Filter **Paid**.
2. Open the order. Check the items, **sizes** and the delivery address.
3. Pack the piece.
4. If Shiprocket is set up: press **Create shipment**. The courier, AWB number, label and tracking link appear. Print the label. The order moves to **Shipped** and **Delivered** by itself when the courier updates it.
   - If it fails, read the message and press **Retry shipment**. It continues where it stopped. It won't book two parcels.
5. Without Shiprocket: ship it yourself, then press **Mark as shipped**. When it arrives, press **Mark as delivered**.

The customer gets an email at each step.

### Cancel an order

1. Open the order → **Cancel order** → confirm.
2. The stock goes back and the **full refund is sent automatically** through Razorpay.
3. **Do not also refund in the Razorpay dashboard.** That would refund twice.

You can't cancel once a courier shipment exists. Cancel the shipment in Shiprocket first, then cancel the order here.

### Invoices

- An invoice is made automatically when an order is paid. Open the order → **Download invoice (PDF)**.
- If there is no invoice, press **Generate invoice**.
- No invoice is made while the shop's legal details (GSTIN, name, address) are still placeholders. Ask your developer to fill them in first.

---

## Returns and refunds

Customers can ask for a return within 7 days of delivery (the number of days is set by your developer).

1. Go to **Returns**. Open a request.
2. Read the reason and look at the photo.
3. Then either:
   - **Approve and refund** — keep **Put items back in stock** ticked if the piece can be sold again. The refund for those pieces is sent automatically.
   - **Reject return** — write a reason. The customer sees it by email.

### When a refund fails

- The order page shows the refund as failed with a **Retry refund** button. Press it once.
- A refund that is stuck for more than 10 minutes also shows **Retry refund**.
- Retrying is safe. The shop checks with Razorpay first, so money is never sent twice.
- Refunds reach the customer's account in about 5–7 working days.

### Refunds the shop makes by itself

You may see refunds you didn't start. This is normal:

- **Sold out after payment**: a customer paid after their 15-minute hold ran out, and someone else bought the last piece. The order shows "Refund pending" and the money goes back in full.
- **Paid twice / paid a cancelled order**: the extra payment is refunded in full.

Do not refund these again in the Razorpay dashboard.

---

## Coupons

1. Go to **Coupons** → new coupon.
2. Fill in:
   - **Code**, e.g. `DIWALI10`. Customers can type it in any case.
   - **Type**: **Percent off** or **Flat amount off**, and the value.
   - **Minimum order** and **Maximum discount** (optional).
   - **Starts** and **Ends** (optional, India time).
   - **Total uses allowed** and **Uses per customer** (optional).
3. Save. Stop a coupon any time with **Turn off** in the list.

---

## Reviews

Only customers whose order was delivered can write a review.

1. Go to **Reviews**. New ones are under **Waiting for review**.
2. Read the text and look at the photos.
3. Press **Publish** to show it, or **Reject** with a reason the customer will see.
4. To take down a published review, press **Unpublish** and give a reason.

Only published reviews count in the star rating. Good recent reviews (4–5 stars) also appear on the home page.

---

## Categories

- **Categories** → add, rename, change the order (**Sort order**), or hide.
- Renaming keeps the old web address unless you type a new **URL name**.
- A category can be deleted only when it has no products.

---

## Who to ask

| Problem                                                    | Ask                              |
| ---------------------------------------------------------- | -------------------------------- |
| Legal name, GSTIN, address on invoices                     | Developer                        |
| Shipping fee, free-shipping amount, return days            | Developer                        |
| Turning WhatsApp, visits, rate bar or style advisor on/off | Developer                        |
| Photo upload not working                                   | Developer                        |
| A payment or refund looks wrong                            | Developer, with the order number |
| Everything else in this guide                              | You can do it here               |
