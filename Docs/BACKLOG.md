# Backlog

Things still to do. Nothing here is broken today.

## Needs Vineet (before going live)

**BL-4 · Encryption key** (added 4 Nov)
Customer addresses and phone numbers are stored encrypted. Before deploying:

1. Create a key: `openssl rand -base64 48`
2. Put it in Vercel as `PII_ENCRYPTION_KEY`, and keep a copy in a password manager. Without it, saved addresses can't be read.
3. After deploying, run `npm run pii:encrypt` once on the live database. Running `npm run pii:encrypt -- --dry` afterwards should show zeros.

**BL-5 · Legal text and business details** (added 4 Nov)

- A lawyer or CA should read the privacy policy and terms.
- Fill in the business and grievance officer details in `config.ini` (sections `[business]` and `[grievance_officer]`). They appear on product pages, policies and invoices.

**BL-6 · Zoho Books / Tally** (added 5 Nov)
Today the shop gives a monthly sales register to import by hand. An automatic sync needs either a Zoho Books account (API details) or a Tally connector on the office PC. Decide which one you use, then share access.

**BL-7 · Backup restore test on the live database** (added 5 Nov)
The restore test has only been run on a test copy (it passed in 3 seconds). Run it once on production:
`npm run backup:drill -- --target "<empty Neon branch address>"`
Then write the result in `Docs/BACKUPS.md`.

## After the final design

**BL-8 · Hindi.** All customer text in Hindi too, with a language switch. Needs the final wording and a translator.

**BL-9 · Dark mode.** Best done together with the final colours.

**BL-10 · Instant cart.** The cart count updates about 0.2 seconds after a click. Making it instant is worth doing with the final header design.

## Planned upgrades

**BL-11 · Next.js 16, Prisma 7, ESLint 10** (added 6 Nov)
Big version jumps that Dependabot suggested (PRs #5, #6, #8). Each needs code changes, so they were closed for now:

- Prisma 7 needs a new config file and database adapter (decision D-09).
- eslint-config-next 16 only works with Next.js 16.
- ESLint 10 isn't supported yet by the TypeScript lint plugins.

Best done together, on their own branch, with the full test run, when there's a quiet week. Dependabot is set to stop suggesting these big jumps (it still sends safe small updates).

## Small fixes found in code review

**BL-1 · "Shown" counts for recommendations can be a little low.**
Counts are saved every few seconds, so the last few seconds can be lost if a server restarts. Clicks and purchases are always exact.
Fix: save as soon as nothing else is being saved.

**BL-2 · Cash-on-delivery sales show late in the recommendations report.**
A COD order counts only after the cash is recorded.
Fix: also count confirmed COD orders, shown separately.

**BL-3 · The homepage loads its product rows one after another.**
Fine with 1–3 rows; slower with many.
Fix: load them all at once.

When something here is fixed, delete it and mention it in `CHANGELOG.md`.
