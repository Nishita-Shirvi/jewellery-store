# Docs — Jewellery Store Project

This folder is the project's memory. It tracks what we are building, where we are, what is stuck, and why decisions were made. Anyone (or any AI chat) joining the project should read this folder first.

## What's in this folder

| File                   | Purpose                                                                                 | When to update                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `Goal.md`              | Goals for every phase, as checklists, with a "Done when" test                           | Tick items as they are finished and verified                   |
| `progress.md`          | Status of all phases + a log written **before** each phase starts                       | Before starting a phase, and after finishing it                |
| `blocker.md`           | Everything stopping or slowing work, who must act, and next steps                       | As soon as a blocker appears or is solved                      |
| `note.md`              | Decisions, defaults, jewellery domain notes, dummy catalogue, other info                | Whenever a default is chosen or something is worth remembering |
| `readme.md`            | This file: how the Docs folder works                                                    | Rarely                                                         |
| `DEPLOY.md`            | Step-by-step: GitHub → Vercel → Neon production → Razorpay webhook → domain → email     | When hosting changes                                           |
| `GO_LIVE_CHECKLIST.md` | Everything to tick before taking real orders, including switching Razorpay to live keys | Before launch                                                  |

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

See `progress.md`. As of 2026-10-08: planning done, Phase 1 not started.
