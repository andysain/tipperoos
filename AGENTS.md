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
- `matches`/`teams`/`seasons` are global by design and carry no `competition_id`. Any query that filters or joins on `match_id` alone does **not** carry competition scope — it must additionally join through `players.competition_id` (for `picks`/`scores`) or `gameweeks.competition_id` (for gameweek-level aggregates). This applies identically to player-facing reads (the leaderboard, Match Centre pick-reveal) and to admin actions. See `docs/adr/0004-multi-competition-foundational-scope.md`.
- Never select a row without an explicit `.order()`. Any query that picks one row from a set — `limit 1`, a first-match loop, a numbered operator prompt — must specify a deterministic order. Postgres row order is arbitrary; "whichever came back first" has already produced three latent bugs here (`matchCompetitionByCode` in `src/lib/auth/competitions.ts`, the #68 migration's backfills, `scripts/set-competition-code.mjs`'s competition selector).

## Required workflow

For every implementation task: confirm scope -> make small verifiable changes -> add/adjust tests for behavior changes (`docs/standards/TESTING_STANDARD.md` §1) -> update `CLAUDE.md`/`BUILD_PLAN.md`/`CONTEXT.md` when behavior or a decision changed, in the same change -> run the validation sequence (`docs/standards/TESTING_STANDARD.md` §3) -> **open the Preview URL and exercise the changed flow yourself before calling it done.** `typecheck`/`lint`/`test`/`build` passing is not the same as the feature actually working — this is Andy's main way to verify agent work without reading Next.js code himself, so don't skip it.

## Branch/PR flow

Every change goes through a branch and a PR (see `BUILD_PLAN.md`'s engineering-process decision for the full reasoning) — but most changes merge themselves the instant CI goes green, no waiting on a human:

1. Branch, commit, push, `gh pr create`, `gh pr merge --auto --squash`. Every PR body starts with a **TL;DR**: one or two sentences, plain language, no jargon, explaining what changed and why it matters — written for a reader who isn't going to read the code (see `.github/pull_request_template.md`). This isn't optional flavour text: it's Andy's actual way of following what agents are shipping without reading the Next.js/TypeScript implementation himself (same reasoning as `docs/standards/TESTING_STANDARD.md` §1a's golden-value spot-check).
2. If the PR doesn't touch `src/lib/**` or `.github/workflows/**`: auto-merges as soon as CI passes. No review needed, no extra step.
3. If it touches `src/lib/**` (the consequence-critical modules — scoring, lock enforcement, Match-2 picker, postponement, PIN/lockout) or `.github/workflows/**`: CODEOWNERS requires Andy's explicit approval before it can merge, even with CI green. This is the one place an independent human check exists in the process, deliberately kept narrow so it doesn't tax everyday UI/config/docs work.

**The agent's own credentials must never be able to modify branch protection, CODEOWNERS, or force-push `main`.** That capability is Andy's alone, permanently — not just at initial setup. If a change to protection rules or `.github/workflows/**` ever seems warranted, the deliverable is the command for Andy to run himself, not the agent running it.

## Worktrees

Parallel agent work happens across git worktrees (Orca), each with its own branch, files, and terminal. Orca shares gitignored build state (`orca.yaml`'s `sharedDirectories`) and copies gitignored per-worktree files (`.worktreeinclude`) automatically — don't hand-roll either. It does **not** auto-fetch, auto-rebase, or warn about staleness during a task; that's on whoever's working the tree.

- New worktrees start from `origin/main` (fetch first) — not a stale local `main`, and not another feature branch unless deliberately stacking work.
- One worktree per task/branch. Delete it (directory + branch together, one Orca action) the moment its PR merges — don't let merged worktrees accumulate.
- For anything long-running, or touching `supabase/migrations/**` (parallel migrations landing out of order is the real failure mode) or the shared docs (`CLAUDE.md`/`BUILD_PLAN.md`/`CONTEXT.md`), `git fetch && git rebase origin/main` before opening the PR.
- **The primary checkout is not special — treat it like any other worktree.** Before starting work in it, `git fetch && git status`, and pull if behind. A stale primary checkout is how a review or a new feature branch quietly gets built against schema/routes that already changed upstream — this happened for real once (see `scripts/review/local-pr-review.mjs`'s staleness warning, which now catches it on every push, `main` included).

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
