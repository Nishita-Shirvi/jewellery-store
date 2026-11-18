# config/

Non-secret settings, one topic per file. Every `*.ini` file here is read at start-up by
`lib/config.ts` and validated; a typo stops `npm run dev` / `npm run build` with a clear message.

| File             | What it holds                                                                | How often it changes |
| ---------------- | ---------------------------------------------------------------------------- | -------------------- |
| `business.ini`   | Legal name, GSTIN, address, grievance officer, invoice prefix                | Rarely (legal)       |
| `shipping.ini`   | Shipping fee, free-shipping threshold, return window                         | Occasionally         |
| `pricing.ini`    | Gold-rate safety limits, which rates the strip shows                         | Occasionally         |
| `storefront.ini` | Announcement bar text, home page counts                                      | Often                |
| `inventory.ini`  | Stock hold minutes, low-stock threshold, alert email                         | Occasionally         |
| `images.ini`     | Image storage provider (Cloudinary / R2), upload size                        | Once, at set-up      |
| `features.ini`   | Switches: SMS, visit booking, WhatsApp, rate strip, style advisor; log level | Occasionally         |

Rules:

- **Never put secrets here** (API keys, passwords, database URLs). They live in `.env` / Vercel.
- Each `[section]` lives in exactly one file. Defining it twice is an error.
- Comments start with `;` or `#`. A ` ; comment` after a value is stripped too — wrap the value in
  quotes to keep a `;` or `#`. An empty value means "use the default".
- A misspelled key name is ignored (the default is used), so check the page after a change.
- Any value can be overridden per environment with an env var named `SECTION_KEY` in upper
  case, e.g. `[shipping] fee_rupees` → `SHIPPING_FEE_RUPEES=0`.
- Changes here need a redeploy. Things the shop team changes day to day (today's gold rate,
  showroom hours, WhatsApp number) are edited in the admin panel instead: Admin → Gold rates,
  Admin → Settings.

Full guide (every key, defaults, env names): [`Docs/CONFIGURATION.md`](../Docs/CONFIGURATION.md). Shop-team guide:
[`Docs/ADMIN_GUIDE.md`](../Docs/ADMIN_GUIDE.md).
