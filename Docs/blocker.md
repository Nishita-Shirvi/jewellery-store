# Blockers

Things only the client can provide. The code for each is ready and waiting.

🔴 needed before going live · 🟠 needed soon · 🟢 nice to have

## Open

**B-01 · Razorpay (payments) 🔴**
Test keys are free and let us try checkout. Live keys need KYC, which can take up to 2 weeks, so start it now.
You'll need: business PAN, bank account, GSTIN, and the website with its policy pages.

**B-04 · Business details 🔴**
Legal name, registered address and state, GSTIN, phone, support email, grievance officer.
Where: `config.ini`, sections `[business]` and `[grievance_officer]`. The pages already show them.

**B-05 · Shiprocket (delivery) 🔴**
Create the account and do KYC, add a pickup address, and check which couriers accept jewellery and up to what value.
Then add an API user (Settings → API) and send us its email and password.
Until then, the owner adds tracking by hand on each order.

**B-10 · Accounts for going live 🔴**
Required: GitHub and Vercel. Recommended: Sentry (errors), Cloudinary (photos), Resend (emails). Neon is done ✅.
Steps: `Docs/DEPLOY.md`.

**B-03 · Pricing model 🟠**
Fixed price per product (used now), or a price from the daily gold/silver rate. Weight and making charge are already stored, so we can switch later.

**B-07 · Domain and email setup 🟠**
The shop's domain name, plus email DNS records (SPF, DKIM, DMARC) so emails don't land in spam.

**B-08 · SMS (MSG91 + DLT registration) 🟠**
Needed for the cash-on-delivery code and order SMS. DLT approval takes 1–2 weeks.
Until then, cash on delivery stays hidden on the live site.

**B-09 · CA / legal review 🟠**
GST rates and HSN codes (default: 7113 at 3%), invoice format, rules for high-value jewellery, privacy and returns policies.
Tip: show your CA a sample invoice PDF.

**B-02 · Design inputs 🟢**
Logo, real product photos and product details. Placeholder images are used until then.

**B-06 · Google login 🟢**
Optional. Hidden until its keys are added (README → "Google login").

## Solved

None yet. When one is solved, move it here with the date and how.
