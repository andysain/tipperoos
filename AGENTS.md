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

| Task touches…                                                                                  | Read first                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Build sequencing, past decisions, rejected alternatives                                        | `BUILD_PLAN.md`                                               |
| Domain vocabulary (is this a Fixture or a Tipped Match? what does "Admin" actually mean here?) | `CONTEXT.md`                                                  |
| A hard-to-reverse architectural call — why does something work this way                        | `docs/adr/`                                                   |
| GitHub issue backlog / what's done vs. open                                                    | `gh issue list -R andysain/tipperoos --state all --limit 100` |
| Frontend/design/UI work                                                                        | `docs/FRONTEND_BRIEFING.md`                                   |

## Non-negotiables (see CLAUDE.md for full detail)

- No client-side Supabase calls, ever — all DB access goes through server-side Next.js API routes/Server Components (`src/lib/supabase/server.ts`, guarded by the `server-only` package).
- All lock/deadline enforcement is server-side, checked against DB time, never a client clock.
- Store timestamps in UTC; render in `Australia/Sydney` only.
- Kid-friendly language: `prediction`/`pick`/`points`/`leaderboard`/`competition` — never `bet`/`odds`/`wager`/`stake`/`payout`/`bookie`.

## Required workflow

For every implementation task: confirm scope -> make small verifiable changes -> add/adjust tests for behavior changes (`docs/standards/TESTING_STANDARD.md` §1) -> update `CLAUDE.md`/`BUILD_PLAN.md`/`CONTEXT.md` when behavior or a decision changed, in the same change -> run the validation sequence (`docs/standards/TESTING_STANDARD.md` §3) -> **open the Preview URL and exercise the changed flow yourself before calling it done.** `typecheck`/`lint`/`test`/`build` passing is not the same as the feature actually working — this is Andy's main way to verify agent work without reading Next.js code himself, so don't skip it.

## Branch/PR flow

Every change goes through a branch and a PR (see `BUILD_PLAN.md`'s engineering-process decision for the full reasoning) — but most changes merge themselves the instant CI goes green, no waiting on a human:

1. Branch, commit, push, `gh pr create`, `gh pr merge --auto --squash`.
2. If the PR doesn't touch `src/lib/**` or `.github/workflows/**`: auto-merges as soon as CI passes. No review needed, no extra step.
3. If it touches `src/lib/**` (the consequence-critical modules — scoring, lock enforcement, Match-2 picker, postponement, PIN/lockout) or `.github/workflows/**`: CODEOWNERS requires Andy's explicit approval before it can merge, even with CI green. This is the one place an independent human check exists in the process, deliberately kept narrow so it doesn't tax everyday UI/config/docs work.

**The agent's own credentials must never be able to modify branch protection, CODEOWNERS, or force-push `main`.** That capability is Andy's alone, permanently — not just at initial setup. If a change to protection rules or `.github/workflows/**` ever seems warranted, the deliverable is the command for Andy to run himself, not the agent running it.
