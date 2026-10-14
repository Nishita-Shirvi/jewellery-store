# Backups and restore

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
