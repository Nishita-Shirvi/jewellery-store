# Onboarding (developers)

Read this first, then `ARCHITECTURE.md` (how it fits together), `CONFIGURATION.md` (settings), `RUNBOOK.md` (when things break) and `progress.md` (what's done).

## Run it locally

Needs Node 22, npm 10 and PostgreSQL 16+ (local install or a free Neon dev branch — **never the production database**).

```bash
npm ci
cp .env.example .env          # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET (openssl rand -base64 32)
npx prisma migrate deploy
npx prisma db seed            # sample catalogue + admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
npm run dev                   # http://localhost:3000
```

Without Razorpay / Shiprocket / Resend / MSG91 keys the shop still works: checkout says "contact us to order" (or offers COD), delivery is tracked by hand, emails and SMS are logged instead of sent.

## Tests — run before every commit

| Command                                | What                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run lint && npm run typecheck`    | ESLint, TypeScript                                                                                                   |
| `npx prettier --check .`               | Formatting                                                                                                           |
| `npm test`                             | Unit tests (no database)                                                                                             |
| `npm run test:db`                      | Real-database tests — needs a **throwaway** database in `DATABASE_URL`                                               |
| `npm run build && npx playwright test` | Browser tests against a production build (port 3100; `tests/e2e/mock-services.mjs` stands in for Razorpay and MSG91) |

The E2E run needs the same variables as CI: copy the `env:` block of `.github/workflows/ci.yml` (with your local `DATABASE_URL`), including `AUTH_TRUST_HOST=true`. CI runs everything on every pull request.

## How we work

- Branch from `main`, open a pull request, CI must be green, the owner merges. Never push to `main`.
- **Migrations only add** (new tables / columns / data); write the SQL by `prisma migrate diff`, wrap it in `BEGIN; … COMMIT;`, and check `prisma migrate diff` shows no drift afterwards. Old code must keep working on the new database (that's what makes rollback safe).
- **New admin action?** Check a permission first (`requirePermission`), add it to `NEEDS` in `tests/admin-actions-guard.test.ts` (the test fails until you do), and write to the activity log (`audit`).
- **New permission?** Add it to `lib/permissions.ts` and insert it in the migration (see `20261106090000_phase29_accounting`).
- **Slow / retryable work** (emails, calls to other services) → a job (`enqueue` in `services/jobs.service.ts`, handler in `services/job-handlers.ts`), queued inside the same transaction as the change.
- **Money** is integer paise, weights integer milligrams. Prices are always recalculated on the server.
- **Personal data** (addresses, phones, invoice buyer) is encrypted with `lib/pii.ts` — use `encryptPii`/`decryptPii`, never store it in plain text.
- Settings that the owner may change → `config.ini` (+ `lib/config.ts` schema), secrets → environment variables (+ `lib/env.ts` and `.env.example`).
- Big or risky changes get tests that fail without the fix (we check this by mutating the code).

## Where things are

`app/` routes and server actions · `services/` business logic (one file per area) · `lib/` helpers, config, validation · `components/` UI · `prisma/` schema and migrations · `tests/` unit, `tests/db/`, `tests/e2e/`, `tests/load/` · `scripts/` one-off tools (`pii:encrypt`, `backup:drill`, `staff:reset-2fa`) · `Docs/` everything written down.

## Production

Vercel (app + cron) and Neon (database). Deploys happen when a PR is merged to `main`. Environment variables live in Vercel. Logs: Vercel → Logs (JSON lines with `requestId`), errors in Sentry. Releases and rollback: `LAUNCH.md`. Backups and the restore drill: `BACKUPS.md`.
