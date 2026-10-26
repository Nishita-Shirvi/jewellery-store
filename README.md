# Jewellery Store

Online jewellery store for India: catalogue with jewellery details (metal, purity, weight, HUID), cart, Razorpay checkout, GST invoices, shipping via Shiprocket, cancellations/returns/refunds, coupons, wishlist, reviews, search, admin panel with reports and audit log.

**Status:** Phases 1–16 built and tested (`Docs/checklist.md`). Going live waits on client accounts (`Docs/blocker.md`).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 · Auth.js v5 · Razorpay · Resend · Vercel + Neon. Details: [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md).

## Quick start

Requirements: Node.js 20.9+ (22 recommended, see `.nvmrc`) and a PostgreSQL 15+ database — a free [Neon](https://neon.tech) database or a local PostgreSQL install.

```bash
npm install                 # also runs prisma generate
cp .env.example .env        # then set DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run db:deploy           # create all tables from prisma/migrations
npm run db:seed             # 1 admin (SEED_ADMIN_EMAIL/PASSWORD), 4 categories, 20 demo products
npm run dev                 # http://localhost:3000  ·  health: /api/health
```

Generate `AUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## Settings: `config.ini` vs `.env`

| File         | Holds                                                                                                 | In git?   |
| ------------ | ----------------------------------------------------------------------------------------------------- | --------- |
| `config.ini` | Business details (legal name, GSTIN, state), shipping fee, invoice prefix, stock hold time, log level | yes       |
| `.env`       | Secrets and URLs: database, auth secret, Razorpay / Resend / Cloudinary / Shiprocket keys             | **never** |

Both are validated at startup; a mistake stops `dev`/`build` with a clear message. Full reference: [`Docs/CONFIGURATION.md`](Docs/CONFIGURATION.md). Integration setup (Razorpay, Shiprocket, email, Google…): [`Docs/INTEGRATIONS.md`](Docs/INTEGRATIONS.md).

## Scripts

| Command                                 | What it does                                                      |
| --------------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                           | Dev server                                                        |
| `npm run build` / `npm start`           | Production build / run it                                         |
| `npm run verify`                        | Lint + typecheck + unit tests — run before every push             |
| `npm test`                              | Unit tests (no database needed)                                   |
| `npm run test:db`                       | Real-database tests — point `DATABASE_URL` at a **throwaway** DB  |
| `npm run test:e2e`                      | Playwright browser tests (needs a build + DB)                     |
| `npm run lint` / `typecheck` / `format` | Individually                                                      |
| `npm run db:migrate`                    | Create + apply a migration after changing `schema.prisma` (dev)   |
| `npm run db:deploy`                     | Apply committed migrations (production does this on every deploy) |
| `npm run db:seed`                       | Load demo data and the admin user (safe to re-run)                |
| `npm run db:reset`                      | Drop everything and re-seed (development only)                    |
| `npm run db:studio`                     | Browse/edit data in Prisma Studio                                 |

## Folder structure

```
app/          Routes: pages, server actions (actions.ts), API routes (app/api)
components/   UI, grouped by feature
services/     Business logic + database access (server-only)
lib/          Helpers: config, env, logger, money, GST, validation, API clients
prisma/       Schema, migrations, seed
tests/        Unit (tests/*.test.ts), database (tests/db), browser (tests/e2e)
Docs/         Documentation — start at Docs/readme.md
config.ini    Non-secret app settings
```

## Documentation

- **New to the code? Start here:** [`Docs/learning/`](Docs/learning/README.md) — a guided path to understand the project end to end and find any bug fast.
- [`Docs/readme.md`](Docs/readme.md) — index of all docs.
- Deploying: [`Docs/DEPLOY.md`](Docs/DEPLOY.md) · Before launch: [`Docs/GO_LIVE_CHECKLIST.md`](Docs/GO_LIVE_CHECKLIST.md) · Logs & debugging: [`Docs/LOGGING.md`](Docs/LOGGING.md)
