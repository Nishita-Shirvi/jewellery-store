# config/

Non-secret settings, one topic per file. Every `*.ini` file here is read at start-up by
`lib/config.ts` and validated; a typo stops `npm run dev` / `npm run build` with a clear message.

Files:

- `business.ini` — legal name, GSTIN, address, grievance officer, invoice prefix. Changes rarely (legal).
- `shipping.ini` — shipping fee, free-shipping threshold, return window, cash-on-delivery rules.
- `pricing.ini` — gold-rate safety limits, which rates the rate strip shows.
- `storefront.ini` — standing message in the rate strip, home page counts.
- `inventory.ini` — stock hold minutes, low-stock threshold, alert email and alert thresholds.
- `images.ini` — image storage provider (Cloudinary / R2 / none), upload size. Set once.
- `features.ini` — switches (SMS, visit booking, WhatsApp, rate strip, style advisor) and log level.
- `marketing.ini` — cart reminders, referrals, festival dates for scheduling.
- `customer.ini` — support email, fallback WhatsApp number, how long old data is kept.

Rules:

- **Never put secrets here** (API keys, passwords, database URLs). They live in `.env` / Vercel.
- Each `[section]` lives in exactly one file. Defining it twice is an error.
- Comments go on their own line, starting with `;` or `#`. Text after a value is part of the value
  (so `address = Shop #12, MG Road` stays whole). An empty value means "use the default".
- A misspelled or unknown section or key name stops start-up with a clear message.
- Any value can be overridden per environment with an env var named `SECTION_KEY` in upper
  case, e.g. `[shipping] fee_rupees` → `SHIPPING_FEE_RUPEES=0`.
- Changes here need a redeploy. Things the shop team changes day to day (today's gold rate,
  showroom address and hours, WhatsApp number) are edited in the admin panel instead:
  Admin → Gold rates, Admin → Showroom.

Full guide (every key, defaults, env names): [`Docs/CONFIGURATION.md`](../Docs/CONFIGURATION.md). Shop-team guide:
[`Docs/ADMIN_GUIDE.md`](../Docs/ADMIN_GUIDE.md).
