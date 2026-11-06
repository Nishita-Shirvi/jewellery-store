# Docs — Jewellery Store Project

This folder is the project's memory. It tracks what we are building, where we are, what is stuck, and why decisions were made. Anyone (or any AI chat) joining the project should read this folder first.

## What's in this folder

**New to the project?** Start with [`learning/README.md`](learning/README.md) — a guided path through the whole codebase.

### Understand and maintain the code

- **`learning/`**
  - Purpose: Learning path: codebase map, feature → files map, critical flows, data model, debugging playbook, exercises
  - Update when: A feature, flow or file location changes
- **`ARCHITECTURE.md`**
  - Purpose: Stack, layers, folder map, background jobs, safety properties
  - Update when: Structure or stack changes
- **`CONFIGURATION.md`**
  - Purpose: `config.ini` (settings) vs `.env` (secrets) — every key, overrides, adding a setting
  - Update when: A setting or env variable is added/removed
- **`LOGGING.md`**
  - Purpose: Logger usage, where to read logs, built-in debugging tools
  - Update when: Logging changes
- **`FEATURES.md`**
  - Purpose: What each feature does for customers and admins
  - Update when: Feature behaviour changes
- **`INTEGRATIONS.md`**
  - Purpose: Setup steps: Razorpay, Resend, Shiprocket, Cloudinary, Google, MSG91, Sentry, GA4, cron
  - Update when: An integration is added or its setup changes

### Run and ship

- **`DEPLOY.md`**
  - Purpose: Step-by-step: GitHub → Vercel → Neon production → Razorpay webhook → domain → email
  - Update when: Hosting changes
- **`GO_LIVE_CHECKLIST.md`**
  - Purpose: Everything to tick before taking real orders, including switching Razorpay to live keys
  - Update when: Before launch
- **`BACKUPS.md`**
  - Purpose: Database backups and restore steps
  - Update when: Backup setup changes
- **`RELEASE_WEEK2.md`**
  - Purpose: Release checklist used for the Week 2 release
  - Update when: (historical)

### Plan and track

- **`checklist.md`**
  - Purpose: One-page feature checklist: done vs pending
  - Update when: A feature is finished
- **`Goal.md`**
  - Purpose: Detailed goals for every phase, with a "Done when" test
  - Update when: Tick items as they are finished and verified
- **`progress.md`**
  - Purpose: Status of all phases + a log written **before** each phase starts
  - Update when: Before starting a phase, and after finishing it
- **`blocker.md`**
  - Purpose: Everything stopping or slowing work, who must act, and next steps
  - Update when: As soon as a blocker appears or is solved
- **`note.md`**
  - Purpose: Decisions, defaults, jewellery domain notes
  - Update when: Whenever a default is chosen or something is worth remembering
- **`readme.md`**
  - Purpose: This file
  - Update when: When a doc is added or removed

## The project in short

- **What:** an online jewellery store for India (rings, necklaces, earrings, bangles; gold, silver and diamond pieces).
- **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui, PostgreSQL + Prisma, Auth.js v5, Razorpay, Zod; Vercel + Neon.
- **Plan:** 30 phases over 4 "weeks" of work (realistically about 5 months for one developer), plus a final frontend design phase.
- **Approach:** backend first. The frontend uses dummy data and placeholder images until the client provides brand inputs.

## Workflow for every phase

1. Read `Goal.md` for the phase and check `blocker.md` for anything affecting it.
2. Write a "Before Phase X" entry in `progress.md` and set the phase to 🟨 In progress.
3. Build the phase (paste Prompt 0 first in a new chat, then the phase prompt).
4. Run the "Done when" checks from `Goal.md` and tick the boxes.
5. Add any new defaults to `note.md` and any new blockers to `blocker.md`.
6. Set the phase to ✅ Done in `progress.md`, commit and tag in git (e.g. `phase-3`).

## Line to add to Prompt 0

Add this rule to Prompt 0 so the AI keeps these files up to date:

```
8. This is a jewellery store. Keep the Docs/ folder updated: before each phase, add a
   "Before Phase X" entry to Docs/progress.md; after each phase, tick the goals in
   Docs/Goal.md, record new defaults in Docs/note.md, and add or resolve items in
   Docs/blocker.md. Focus on the backend; the frontend uses placeholder UI, dummy
   jewellery data and placeholder images until the final design is ready.
```

When starting a new chat mid-project, paste Prompt 0, the folder tree, `prisma/schema.prisma`, and `Docs/progress.md`.

## Current status

See `checklist.md` (summary) and `progress.md` (detail). As of 2026-10-25: Phases 1–16 done and verified; production hardening pass done (missing Phase 14–16 migration added, `config.ini`, structured logger, docs + learning path). Going live waits on client accounts (`blocker.md`).
