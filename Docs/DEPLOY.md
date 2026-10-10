# Deploying the store (Vercel + Neon)

Follow these steps once. After that, every `git push` to `main` runs the tests on GitHub and Vercel redeploys automatically.

## 0. Before you start

You need accounts on: **GitHub**, **Vercel** (sign up with GitHub), **Neon** (already done), **Razorpay**, and optionally **Resend**, **Cloudinary**, **Sentry**. All have free plans.

## 1. Put the code on GitHub

```powershell
git init                      # skip if you already did this
git add .
git commit -m "Phase 8: ready to deploy"
```

On github.com click **New repository** → name it `jewellery-store` → **Private** → Create. Then copy the two commands GitHub shows under "push an existing repository", e.g.:

```powershell
git remote add origin https://github.com/<you>/jewellery-store.git
git push -u origin main
```

Check that the `prisma/migrations` folder is in the repository — production uses it to create the tables. Never commit `.env` (it's already in `.gitignore`).

Open the repository's **Actions** tab: the **CI** workflow should go green (lint, unit tests, build, secret scan, Playwright).

## 2. A database for production

In Neon, create a **branch** called `production` from `main` (Branches → Create branch), or a separate project. Copy its **pooled** and **direct** connection strings (Connect button, pooling on/off) — you'll paste them into Vercel.

## 3. Create the Vercel project

1. vercel.com → **Add New → Project** → import `jewellery-store`.
2. Framework: Next.js (detected). Build command: leave default — Vercel runs our `vercel-build` script, which applies database migrations, then builds.
3. **Environment Variables** — add these for _Production_ (and _Preview_ with test values):

| Variable                                                               | Value                                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                         | Neon production **pooled** string                                                                   |
| `DIRECT_URL`                                                           | Neon production **direct** string                                                                   |
| `AUTH_SECRET`                                                          | a NEW random secret (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `NEXT_PUBLIC_APP_URL`                                                  | `https://www.yourstore.in` (or the `.vercel.app` address for now)                                   |
| `NEXT_PUBLIC_SITE_NAME`                                                | your store name                                                                                     |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`                              | **test** keys first; live keys at go-live                                                           |
| `RAZORPAY_WEBHOOK_SECRET`                                              | a new long random text (also entered in Razorpay, step 5)                                           |
| `RESEND_API_KEY`, `EMAIL_FROM`                                         | from Resend (after verifying your domain)                                                           |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from Cloudinary                                                                                     |
| `BUSINESS_*`, `GRIEVANCE_OFFICER_*`                                    | your real business details                                                                          |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`                                 | from Sentry (optional)                                                                              |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                 | optional, for Google login                                                                          |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`                              | only if you'll seed this database                                                                   |

Do **not** set `RAZORPAY_API_BASE`, `CLOUDINARY_API_BASE` or `AUTH_TRUST_HOST` on Vercel — they're for tests only.

4. Click **Deploy**. When it's done, open `https://<project>.vercel.app/api/health` → `{"status":"ok","db":"ok"}`.

## 4. First admin and products

The production database starts empty. Either seed it once from your computer (creates the admin and the dummy catalogue):

```powershell
# temporarily point .env DATABASE_URL and DIRECT_URL at the production branch, then:
npx prisma db seed
# switch .env back to your development database afterwards
```

…or register normally on the live site and make yourself admin in Neon's SQL editor:
`UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';`

## 5. Razorpay webhook

Razorpay Dashboard → **Account & Settings → Webhooks → Add New Webhook**

- URL: `https://www.yourstore.in/api/webhooks/razorpay`
- Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`
- Also check **Payment capture** is set to **Automatic** (Account & Settings → Payment Capture).

Do this in **Test Mode** first, and again in **Live Mode** when you switch keys.

## 5b. Shiprocket tracking webhook

Shiprocket → **Settings → API → Webhooks**: URL `https://www.yourstore.in/api/webhooks/courier-updates`, token = the value of `SHIPROCKET_WEBHOOK_TOKEN`. (Don't use a URL containing the word "shiprocket" — Shiprocket rejects it.) Add the `SHIPROCKET_*` and shipping-fee variables to Vercel too.

## 6. Your domain + HTTPS

Vercel project → **Settings → Domains** → add `yourstore.in` and `www.yourstore.in` → follow the DNS instructions shown (at GoDaddy/Namecheap/Hostinger etc.). HTTPS certificates are automatic. Then update `NEXT_PUBLIC_APP_URL` and redeploy.

Also update: Google OAuth redirect URI (`https://www.yourstore.in/api/auth/callback/google`) and the Razorpay webhook URL.

## 7. Email domain (Resend)

Resend → **Domains → Add domain** → add the DNS records it shows (SPF, DKIM, and add a DMARC record `v=DMARC1; p=none; rua=mailto:you@yourstore.in`). After verification set `EMAIL_FROM="Your Store <orders@yourstore.in>"`.

## Rolling back a bad deploy

Vercel → **Deployments** → pick the last good one → **⋯ → Promote to Production**. Database migrations are additive, so older code keeps working.
