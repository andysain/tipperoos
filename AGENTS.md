<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Tipperoos — agent router

This file is a router, not a rulebook — the linked docs own their rules; don't duplicate them here.

## Read first, always

- `CLAUDE.md` — the product spec (the **what**). Product behavior, hard constraints, data model.
- `docs/standards/TESTING_STANDARD.md` — testing philosophy, validation order, definition of done (the **how**).

## Read when relevant

| Task touches… | Read first |
|---|---|
| Build sequencing, past decisions, rejected alternatives | `BUILD_PLAN.md` |
| Domain vocabulary (is this a Fixture or a Tipped Match? what does "Admin" actually mean here?) | `CONTEXT.md` |
| A hard-to-reverse architectural call — why does something work this way | `docs/adr/` |
| GitHub issue backlog / what's done vs. open | `gh issue list -R andysain/tipperoos --state all --limit 100` |

## Non-negotiables (see CLAUDE.md for full detail)

- No client-side Supabase calls, ever — all DB access goes through server-side Next.js API routes/Server Components (`src/lib/supabase/server.ts`, guarded by the `server-only` package).
- All lock/deadline enforcement is server-side, checked against DB time, never a client clock.
- Store timestamps in UTC; render in `Australia/Sydney` only.
- Kid-friendly language: `prediction`/`pick`/`points`/`leaderboard`/`competition` — never `bet`/`odds`/`wager`/`stake`/`payout`/`bookie`.

## Required workflow

For every implementation task: confirm scope -> make small verifiable changes -> add/adjust tests for behavior changes (`docs/standards/TESTING_STANDARD.md` §1) -> update `CLAUDE.md`/`BUILD_PLAN.md`/`CONTEXT.md` when behavior or a decision changed, in the same change -> run the validation sequence (`docs/standards/TESTING_STANDARD.md` §3).
