# Backups and restore

## Targets

**How much data could we lose?** 0–5 minutes. Neon keeps every change and can rewind to any moment. Worst case, if only the weekly copy survives: up to 1 week.

**How long until we're selling again?** Up to 4 hours: restore (minutes), point Vercel at it and redeploy (about 5 minutes), then check everything.

Measured with `npm run backup:drill` — see the drill log at the end.

## What's backed up automatically

- **Database (Neon):** Neon keeps a history of every change and can restore the database to any moment inside your plan's history window (check **Neon → Settings → Storage → History retention** for your plan's window).
- **Code:** GitHub keeps every version.
- **Product photos:** stored in Cloudinary (not on Vercel).

## Restore the database to an earlier moment (no data loss on the live site)

1. Neon → your project → **Branches → Create branch**.
2. Choose **From: production (or main)** and **Include data up to: a specific time** — pick a time just before the problem.
3. Open the new branch → **Connect** → copy its connection strings and inspect the data (Prisma Studio with those URLs in a temporary `.env`).
4. To switch the live site to it: put the branch's pooled + direct URLs in Vercel → Environment Variables → `DATABASE_URL` / `DIRECT_URL` → **Redeploy**.
5. Write down the time taken and what was restored (Phase 30 rehearses this).

## Extra weekly copy (recommended before launch)

Run from your computer once a week (needs PostgreSQL client tools installed):

```powershell
pg_dump "YOUR_DIRECT_URL" --format=custom --file "backup-$(Get-Date -Format yyyy-MM-dd).dump"
```

Keep the files somewhere private (they contain customer data). Restore into a fresh database with:

```powershell
pg_restore --no-owner --dbname "NEW_DATABASE_DIRECT_URL" backup-2026-10-11.dump
```

## Also keep safe (outside the code)

- A copy of all Vercel environment variables (password manager), especially `AUTH_SECRET`, Razorpay, Shiprocket, Resend and Cloudinary keys.

## Photos, settings and secrets

- **Product photos:** in Cloudinary. Cloudinary keeps them independently of Vercel; download a copy now and then (Cloudinary → Media Library → select all → Download), or use their backup add-on.
- **Settings:** `config.ini` is in Git — every version is kept on GitHub.
- **Environment variables (secrets):** not in Git on purpose. Keep a copy of every Production value from Vercel → Settings → Environment Variables in a password manager. **`PII_ENCRYPTION_KEY` and `AUTH_SECRET` are critical**: without `PII_ENCRYPTION_KEY` the saved addresses, phone numbers and invoice buyer details in any backup can't be read.
- **Staff two-step sign-in:** each person keeps their own recovery codes; `npm run staff:reset-2fa` (see RUNBOOK) if someone loses theirs.

## Restore drill

Proves a backup can really be restored, and how long it takes. It only reads the live database.

```powershell
# into a fresh Neon branch (create an empty branch first, copy its direct URL):
$env:DIRECT_URL = "<production direct URL>"
npm run backup:drill -- --target "<empty branch direct URL>"
```

It backs up (`pg_dump`), restores (`pg_restore`), compares the row count of every table and the newest order and invoice, and prints the time each step took. "DRILL PASSED" means the backup is complete. Do it before launch and then every 3 months; delete the branch afterwards.

### Drill log

- **5 Nov 2026 · test copy (0.6 MB):** passed. All 63 tables and the latest invoice matched. Backup 0.6 s, restore 2.3 s, total 3.1 s.
- **Production → Neon branch:** still to do before launch (BL-7).
