# Week 3 release checklist

Week 3 (Phases 17–23) is built and tested on branch `week3-growth`. **It is not deployed yet:** going live needs the client's GitHub and Vercel accounts (blocker B-10 in `Docs/blocker.md`). Tick these off once they exist.

## 1. Before merging

- [ ] Read `CHANGELOG.md` (Week 3 sections) and `Docs/SECURITY_REVIEW.md`.
- [ ] Pull the branch, `npm install`, `npx prisma migrate deploy` against a **copy** of the database first (Neon → Branches → Create branch), then `npm run dev` and click through: a product with sizes, checkout with a coupon, cash on delivery (if enabled), an account → support request, forgot password.
- [ ] Merge `week3-growth` into `main`; GitHub **Actions** is green.

## 2. Database

- [ ] 7 new migrations (Phases 17–23) are additive — no columns or tables are removed. `npx prisma migrate deploy` on the live database after the copy worked.
- [ ] Each existing product got one "base" variant automatically (Phase 17); spot-check a few product pages.
- [ ] Existing admins became **Owners** (Phase 21). Each owner sets up two-step sign-in on first visit to `/admin` — have an authenticator app ready.

## 3. Vercel settings

- [ ] New environment variables as needed: `CRON_SECRET` (background jobs; staff two-step sign-in needs nothing new, its key comes from `AUTH_SECRET`), `MSG91_AUTH_KEY` + `MSG91_OTP_TEMPLATE_ID` (cash on delivery, B-08), `NEXT_PUBLIC_SENTRY_DSN`, `CLOUDINARY_*`, `RESEND_API_KEY`.
- [ ] Background jobs: GitHub `cron.yml` enabled (`ENABLE_CRON=true`, `SITE_URL`, `CRON_SECRET`) so `/api/cron/jobs` runs every 10 minutes for retries and reminders. Check **Admin → Background jobs** shows jobs finishing.
- [ ] `config.ini`: `[support] notify_email` and (optional) `whatsapp_number`; `[cod]` rules if cash on delivery will be offered.

## 4. After deploying

- [ ] `/api/health` OK; `app.start` log line shows the expected integrations.
- [ ] Browser developer tools → Console on the home, product and checkout pages: **no "Content Security Policy" errors**. If a new script is added later (chat widget, pixel…), its domain must be added in `lib/csp.ts`.
- [ ] On a phone: open the site → browser menu → **Add to Home screen**; the icon and name appear. Turn on airplane mode and open it: the "You're offline" page shows.
- [ ] "Forgot your password?" email arrives (needs Resend + domain, B-07) and the link works once.
- [ ] One real test order each way: prepaid with a coupon, and COD (once SMS is live).
- [ ] Load test against the **live site only with notice and off-peak**: `k6 run -e BASE_URL=https://<domain> tests/load/k6-shop.js`. Targets: 95% of requests under 800 ms, under 1% errors.

## Test results at release

- Unit, real-database and browser (Playwright) suites all green — counts in `Docs/progress.md`.
- k6, 200 shoppers at once against a local production build: **0% errors, p95 578–676 ms** (target < 800 ms). Each page takes ~10 ms when idle; the time under load is queueing on a single laptop process (catalogue data is already cached), so Vercel, which runs several instances, should do better.
