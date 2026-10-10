# Blockers

Anything stopping or slowing a phase goes here. When a blocker is solved, move it to "Resolved" with the date and how it was solved.

Priority: 🔴 Blocking now · 🟠 Needed soon (within the next few phases) · 🟢 Needed later

**Last updated:** 2026-10-08

---

## Open blockers

| ID   | Blocker                                                                                                                                                                          | Affects phase(s)              | Priority | Owner  | Raised     | Status / next step                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | **Razorpay**: test keys needed now to try checkout locally (free, no KYC). Live keys need KYC (days to 2 weeks) before going live in Phase 8.                                    | 6 (test), 8 (live)            | 🔴       | Client | 2026-10-08 | Create account → Test Mode → API Keys. Start KYC for live keys now: business PAN, bank account, GSTIN, website with policy pages.            |
| B-02 | **Frontend design inputs missing:** logo, brand colours, fonts, real product photos, real product data, homepage content.                                                        | Future frontend phase, 24, 28 | 🟢       | Client | 2026-10-08 | Not blocking. Using dummy data and placeholder images (see note.md).                                                                         |
| B-03 | **Pricing model not decided:** fixed price per product, or price based on daily gold/silver rate (metal rate × weight + making charges + stones + GST).                          | 2, 4, 5, 6, 12, 17            | 🟠       | Client | 2026-10-08 | Default chosen: fixed price in paise. Weight and making charge fields are stored so we can switch later. Confirm with client before Phase 6. |
| B-04 | **Business details missing** for legal pages: legal name, registered address and state, GSTIN, phone, support email, grievance officer.                                          | 8, 12, 27                     | 🔴       | Client | 2026-10-08 | Put them in the BUSINESS_* variables (.env locally, Vercel for the live site). Pages are ready and waiting.                                  |
| B-05 | **Shiprocket account + KYC**, a pickup address named to match `SHIPROCKET_PICKUP_LOCATION`, and confirming which couriers accept jewellery, declared-value limits and insurance. | 10, 18                        | 🔴       | Client | 2026-10-08 | Code is ready. Create the account, add an API user (Settings → API → Add New API User), put its email/password in `.env`.                    |
| B-06 | **Google OAuth credentials** (client ID/secret) and consent screen.                                                                                                              | 3                             | 🟢       | Client | 2026-10-08 | Google login code is done and hidden until keys are added. Steps in README → "Google login (optional)".                                      |
| B-07 | **Domain name** and email DNS (SPF, DKIM, DMARC) for sending emails.                                                                                                             | 6 (emails), 8, 30             | 🟠       | Client | 2026-10-08 | Resend test domain can be used until then.                                                                                                   |
| B-08 | **MSG91 account + TRAI DLT registration** for SMS templates (OTP). DLT can take 1–2 weeks.                                                                                       | 12 (optional), 18             | 🟢       | Client | 2026-10-08 | Start before Week 3.                                                                                                                         |
| B-09 | **CA / legal review** of GST rates and HSN codes, PAN/cash rules for high-value jewellery, privacy policy and returns policy.                                                    | 12, 18, 27                    | 🟢       | Client | 2026-10-08 | Defaults noted in note.md; must be confirmed before launch.                                                                                  |
| B-10 | **Accounts for going live:** GitHub, Vercel (required); Sentry, Cloudinary, Resend (recommended). (Neon ✅)                                                                      | 8                             | 🔴       | Client | 2026-10-08 | Follow Docs/DEPLOY.md step by step.                                                                                                          |

---

## Template for a new blocker

```
| B-XX | What is blocked and why | Phase(s) | 🔴/🟠/🟢 | Who must act | YYYY-MM-DD | Next step |
```

---

## Resolved

| ID  | Blocker | Resolved on | How it was resolved |
| --- | ------- | ----------- | ------------------- |
| —   | —       | —           | —                   |
