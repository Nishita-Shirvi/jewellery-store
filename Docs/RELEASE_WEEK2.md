# Week 2 release checklist

- [ ] Paste the latest zip into your project folder, `npm install`, `npx prisma migrate dev` (answer **y** to unique-constraint questions, **N** to any reset), `npm run dev` and click through: search, filters, a product page, cart, checkout with a coupon, an order page.
- [ ] Commit and push; GitHub **Actions** is green.
- [ ] Vercel deployment succeeded; `/api/health` OK on the live site.
- [ ] New Vercel environment variables (as needed): `SHIPROCKET_*`, `SHIPPING_FEE_RUPEES`, `FREE_SHIPPING_ABOVE_RUPEES`, `BUSINESS_STATE`, `INVOICE_PREFIX`, `ADMIN_ALERT_EMAIL`, `NEXT_PUBLIC_GA_ID`, `RESEND_API_KEY`.
- [ ] Razorpay webhook events include `refund.processed` and `refund.failed`.
- [ ] Shiprocket webhook set to `/api/webhooks/courier-updates` (once Shiprocket is ready).
- [ ] Google Search Console: submit `/sitemap.xml`.
- [ ] PageSpeed Insights on the live home page and one product page (mobile) — target 90+ performance and SEO; send the scores.
- [ ] Show a sample invoice PDF to your CA.
- [ ] Read `Docs/BACKUPS.md` and try one restore into a new Neon branch.
