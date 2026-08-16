# Scripted gameweek-simulation test (issue #22)

A scripted, deterministic end-to-end run of one full gameweek cycle —
pick → lock → result → score → corrected result → rescore → void → rescore —
that proves the real scoring engine produces **exactly** the points the spec
promises, on real database rows, with nothing left behind. It is the pre-go-live
proof that scoring works, as close to production as we can get without shipping.

It lives in `scripts/scripted-gameweek-simulation/` and runs against the shared
**staging** Supabase project from local dev.

> Terminology: this is a predictions/picks game — the language here is
> `pick` / `points` / `leaderboard` / `competition`, never betting terms.

## Purpose

Before go-live we need to know the scoring pipeline is right. The earlier
scoring work (issue #21) is covered by unit tests; this test is the
integration-level check that:

- the full cycle works against **real staging rows** (not mocks) driven through
  the real `src/lib/scoring` engine (`recomputeMatchScores` + `writeScores`),
- points are **never accumulated or drifted** — every rescore replaces the
  match's score rows,
- corrected results, voided matches, and cross-competition shared fixtures all
  score against the spec,
- **nothing is left behind** — the synthetic competition, players, picks,
  scores, matches, teams and season are disposed afterwards, proven by a
  baseline row-count snapshot,
- and, with the built-in report, **you can see the scoring data** — per player,
  per match, per stage — plus ranked competition leaderboards.

Issue #34 (full end-to-end dry run) will drive the _same steps_ through the real
API routes instead of lib calls, so the scenario can also serve as the
pre-launch UI rehearsal once routes are ready.

## What it does, step by step

The scenario builds a small synthetic world on staging:

- one season, two global teams (⚽A, ⚽B), two matches in it,
- **competition A** (3 players) tips both matches; **competition B** (2 players)
  tips only match one — the two competitions' gameweeks **share** match one,
  which is the cross-competition leak check,
- all `provider_name = 'sim'` / `sim-…` labels mark the rows as script-owned.

Then it walks the cycle, asserting after every stage and printing a readable
scoring report:

1. **pick** — every player picks a scoreline for each match they see.
2. **lock** — a narrative step; lock _enforcement_ is server-side route logic
   (CLAUDE.md: picks lock 5 minutes before kickoff, issue #16), so at the lib
   level this is deliberately a no-op that keeps the seam 1:1 with the cycle.
3. **result + score @ 2-1** (match one) — asserts the engine's anchors:
   exact scoreline → **7** (3 result + 2 exact + 1 + 1), correct result but
   wrong scoreline → **5** (3 + 1 + 1), wrong result → **0**.
4. **result + score @ 3-1** (match two) — same anchors, plus the
   wrong-way-round pick (1-3 vs 3-1) pays **exactly 1**.
5. **leaderboard check** — `scoresForCompetition` returns only _that_
   competition's players with the right totals (the shared-match leak check).
6. **corrected result @ 1-0 → rescore** — the 7 is **replaced** by 5, never
   added to; re-running score on an unchanged state is idempotent.
7. **void via the gameweek slot** (match one) — every picker of a voided match
   scores **0**, in _both_ competitions (shared-match void contract); un-void
   restores the real points.
8. **void via `postponed` status** (match two) — the defensive signal works
   even for matches with a voided slot signal toggled, and the authoritative
   slot signal wins in the final state.
9. **post-void leaderboards** — still scoped, still right.
10. **dispose + baseline proof** — deletes every synthetic row in dependency
    order and re-checks global row counts match the pre-run snapshot.

Any drift between the expected points (computed by the very same
`recomputeMatchScores` the engine writes) and what's read back from the `scores`
table shows up as a mismatch in the report — and fails the run.

## How it's structured

| File                                  | Role                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripted-gameweek-simulation.sim.ts` | The scenario: one `it()` walking the cycle, asserting anchors (D8 literals pinned to CLAUDE.md's scoring section) and triggering the reports.                                                                                                                       |
| `fixtures.ts`                         | The synthetic staging world: `createSimulationWorld`, `disposeSimulationWorld`, `snapshotRowCounts`/base-lining, `setMatchStatus`/`setSlotVoided`, and the `SIM_KEEP_WORLD` cleanup guidance.                                                                       |
| `driver.ts`                           | The **driver seam**: every cycle step goes through the injectable `GameweekSimulationDriver` interface; this repo ships `LibGameweekSimulationDriver` (lib + direct DB rows). Issue #34 reuses the scenario against real routes by implementing the same interface. |
| `report.ts`                           | Readable per-stage scoring tables (expected vs actual, per pick) and ranked leaderboards.                                                                                                                                                                           |
| `vitest.config.ts`                    | Dedicated config — `*.sim.ts` is deliberately **not** collected by `npm test`'s default glob, so CI never runs (or touches) this without explicit credentials.                                                                                                      |

## Prerequisites

- Staging Supabase project with the app's schema applied (run `supabase/migrations/**`).
- Staging URL + service role key. These are the same creds as your local
  `.env.local` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Repo deps installed (`npm install`).

## How to run

From the repo root:

```bash
SUPABASE_URL=<staging URL> SUPABASE_SERVICE_ROLE_KEY=<staging key> \
  npx vitest run --config scripts/scripted-gameweek-simulation/vitest.config.ts
```

Typical local-dev invocation pulling creds from `.env.local`:

```bash
set -a; source .env.local; set +a
npx vitest run --config scripts/scripted-gameweek-simulation/vitest.config.ts
```

If the env vars are missing the test fails immediately with a message telling
you the exact command to run — it never partially runs or half-touches staging.

### What you'll see

Pass/fail assertions plus a live scoring report like this:

```
match one scored  •  result 2-1
  A1   pick 2-1    expected  7  actual  7
  A2   pick 1-0    expected  5  actual  5
  A3   pick 0-2    expected  0  actual  0
  B1   pick 2-1    expected  7  actual  7
  B2   pick 0-3    expected  0  actual  0

match one corrected to 1-0 (replacement, not accumulation)  •  result 1-0
  A1   pick 2-1    expected  5  actual  5
  ...

competition A — totals (post-void)  (competition 9f2a1b3c…)  ranked by total
  A1   total  5
  A2   total  7
  A3   total  0
```

`expected` is computed by the exact function the engine writes with
(`recomputeMatchScores`); `actual` is read back from real staging `scores` rows.
If they ever disagree, that's the drift the test exists to catch.

## Inspecting the data afterwards: `SIM_KEEP_WORLD=1`

By default every synthetic row is disposed in a `finally` block and global row
counts are proven back to baseline. To _keep_ the world so you can inspect the
real rows (Supabase SQL editor, or eventually the app UI):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SIM_KEEP_WORLD=1 \
  npx vitest run --config scripts/scripted-gameweek-simulation/vitest.config.ts
```

In this mode the scenario still asserts everything, but skips disposal, prints
the ids of every synthetic row (competitions, season, gameweeks, matches, teams,
players), and prints ready-to-run cleanup SQL. **Your call, manually** — this
mode exists for inspection and leaves rows on the shared staging project:

```sql
-- printed at the end of the run; safe to re-run (matches on sim markers only)
delete from scores where match_id in (select id from matches where provider_name = 'sim');
delete from picks where match_id in (select id from matches where provider_name = 'sim');
delete from gameweeks where competition_id in (select id from competitions where name like 'Sim Comp %');
delete from players where competition_id in (select id from competitions where name like 'Sim Comp %');
delete from matches where provider_name = 'sim';
delete from competitions where name like 'Sim Comp %';
delete from teams where provider_name = 'sim';
delete from seasons where label like 'sim-%';
```

## Safety rules (read before running at all)

- **Shared staging project.** The test writes rows to the same staging DB the
  whole team (and other worktrees) use — that's deliberate (D1: prove against
  real rows), but it must clean up after itself (D7).
- **Every synthetic row is identifiable.** `provider_name = 'sim'` on
  teams/matches, `sim-…` labels on seasons, `Sim Comp …` on competitions, and
  `sim-unused` code/pin hashes. Anything left over (e.g. a cancelled run) is
  findable and removable with the cleanup SQL above.
- **Local dev only (D1a), never CI.** `npm test` never collects this file;
  the dedicated config + missing-cred fail-fast make it impossible to run
  accidentally. A future CI wiring-up would need explicit staging secrets and
  an explicit decision to touch staging from CI.
- **Don't run while other staging writes are happening** (other agents' sims,
  bootstrap scripts) — the row-count baseline proof assumes nobody else inserts
  into the eight synthetic tables mid-run; a concurrent insert shows up as a
  count mismatch and fails the run.

## Troubleshooting

| Symptom                                                          | Cause / fix                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`               | Run with the env vars set; the message prints the exact command.                                                                                                                     |
| Fails with a row-count mismatch on `competitions`/`players`/etc. | Something else wrote to staging mid-run, or a previous run left rows behind. Check for `Sim Comp %` competitions / `provider_name = 'sim'` rows and remove them (cleanup SQL above). |
| Timeout at 120s                                                  | Slow staging or a lot of other traffic; the timeout is generous — score calls are a handful of queries.                                                                              |
| Report shows `expected` ≠ `actual`                               | The engine drifted from spec — this is the test doing its job. Start at `src/lib/scoring/match.ts` and CLAUDE.md's scoring section.                                                  |

## Where it fits

- **Issue #22** — this test; **issue #21** — the additive scoring engine it
  exercises; **issue #34** — the route-level dry run that will reuse this
  scenario via `GameweekSimulationDriver`.
- Scoring spec: `CLAUDE.md` (the **what**) and `src/lib/scoring/match.ts` (the
  how). The D8 anchors in the scenario are pinned to CLAUDE.md's scoring
  section — if the spec changes, the anchors change deliberately.
- Testing philosophy: `docs/standards/TESTING_STANDARD.md`.
- Multi-competition scope invariants: `docs/adr/0004-multi-competition-foundational-scope.md`
  (the shared-match leak check exists because of this).
