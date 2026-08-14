# Performance Testing Standard

Companion to `docs/standards/TESTING_STANDARD.md`, written for the same
constraint set: one maintainer working through an AI agent, ~10–20 players,
free-tier-only hosting. Its job is narrow — **catch performance regressions
before players feel them, and point at the highest-value thing to fix next**
— and it deliberately refuses most of what a "performance testing plan"
normally contains, because at this scale that machinery costs more to
maintain than the regressions it would catch.

Everything below was validated against the codebase on 2026-08-14, not
inherited from a template. Where a number is a guess rather than a
measurement, it says so.

## 1) Core principle: measure the request path, not the page

This app's slowness is almost entirely **server-side round trips and
server-side CPU**. The pages are small, mostly server-rendered, and carry no
heavy client bundle (`react`, `next`, `lucide-react`, `tailwind-variants` and
nothing else). Every authenticated route is `export const dynamic =
"force-dynamic"` by necessity — the current gameweek is derived per request,
lock times are DB-authoritative — so there is no static-caching win available
and no CDN layer to tune.

That means:

- **Chasing Core Web Vitals is chasing the wrong number here.** LCP on `/` is
  a near-direct function of how long the Server Component spends awaiting
  Supabase. Fix the awaits and LCP follows; tune the client and nothing moves.
- The two measurements that matter are **serial round-trip depth** (how many
  Supabase calls happen strictly one-after-another before a response can be
  produced) and **blocking CPU per request** (`scryptSync`).

Both are countable by reading code. That is the cheapest performance tool
this project has, and §4 makes it the primary one.

## 2) What the tooling actually is

Three things, in descending order of value. Nothing else is approved.

### 2a) Vercel Speed Insights — already installed, passive

Wired into `src/app/layout.tsx`. Real-user LCP/CLS/INP from actual players on
actual phones, zero maintenance, free on Hobby. This is the entire
front-end-performance story and it is sufficient. **Not fully verified**:
Hobby's Speed Insights free allowance is capped at a monthly data-point count
(believed 10k events); at ~20 players it will not be approached, but if the
dashboard ever shows sampling, that is why.

Read it monthly, and after any milestone that changes a page's data loading.
It is a _detector_, not a diagnostic — it tells you a page got slower, never
which `await` did it.

### 2b) A round-trip budget script — the one thing to build

`scripts/perf/check-api-budgets.mjs` (not yet written; approving this doc
approves writing it). Hits a fixed list of routes N times against a deployed
URL, reports p50/p95 per route, exits non-zero on a budget breach.

Keep it under ~150 lines and dependency-free (`fetch` + `performance.now()`).
It needs a session cookie and a competition code to reach anything
interesting, so it should log in once at the start and reuse the cookie —
which is also, conveniently, how it measures the login path.

**It is not a required CI check.** Run it manually before a milestone and
after any change to a Server Component's data loading. Reasons it stays
advisory rather than blocking:

- Free-tier timings are cold-start-dominated and genuinely noisy;
  a blocking check would produce false failures more often than true ones,
  and a check that gets ignored is worse than no check.
- Preview deploys point at the **staging** Supabase project, which holds
  different row counts than production — the numbers aren't comparable
  across environments, so a single fixed threshold can't gate both.

### 2c) A real phone, on cellular, before each milestone

The subjective pass. Non-negotiable and not replaceable by a metric, because
the known complaints in `LAUNCH_ORDER.md` ("slow login", "laggy grey card →
full contrast team-add") are _feel_ problems that a p95 number can report as
healthy. §6 is the checklist.

### 2d) Explicitly rejected: Lighthouse CI

The draft of this plan proposed Lighthouse CI in GitHub Actions against
Preview URLs. Cut, for four reasons, in order of decisiveness:

1. **It cannot reach the pages worth measuring.** `/` and `/predict-table`
   both `redirect("/login")` without a session cookie, and `/login` itself is
   gated behind the private competition code. Getting Lighthouse past that
   requires scripting a login — i.e. Playwright — which
   `TESTING_STANDARD.md` §2 explicitly declined to adopt at this scale. The
   cost isn't the Lighthouse config, it's the browser-automation dependency
   it drags in behind it.
2. **It would measure the wrong layer.** See §1: front-end is not where the
   time goes.
3. **Speed Insights already covers it, from real devices**, which is strictly
   better data than a synthetic run against a cold Hobby function.
4. It would report the same regression twice, and the duplicate would be the
   less trustworthy of the two.

GitHub Actions minutes are _not_ the blocker — this repo is public, so
Actions minutes are unlimited. Lighthouse CI is affordable here; it's just
not useful here.

## 3) Budgets

Per **route class**, not one global number. The draft's single "p95 < 200ms
for all API routes" is not achievable and would have been a permanently-red
target — see the login class below.

| Class                          | Routes                                                     | p95 budget | Basis                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Single-RPC mutation            | `table-predictions/assign`, `/unassign`, `/submit`         | 250 ms     | Target. One RPC + auth; the floor is one APAC round trip.                                                                             |
| Multi-query mutation           | `/api/picks`, `table-predictions/skip`                     | 400 ms     | Target, reflecting current 3–4 serial depth. Tighten after §4 fixes.                                                                  |
| Password-class auth            | `/api/auth/login`, `/api/auth/signup`, `/api/auth/players` | 700 ms     | **Floor-constrained**: see the scrypt note below.                                                                                     |
| Page render (server portion)   | `/`, `/predict-table`                                      | 1200 ms    | Target, chosen against the current ~11-deep serial chain on `/`.                                                                      |
| Real-user LCP (Speed Insights) | `/`, `/predict-table`, `/login`                            | 2.5 s      | Standard "good" threshold; the only borrowed number here, and it's the right one to borrow since it's what players actually perceive. |
| Real-user INP                  | all                                                        | 200 ms     | Standard "good" threshold.                                                                                                            |

**The scrypt floor is the important row.** `scryptSync` at Node's defaults
(N=16384, r=8, p=1, keylen=64) measures **~62 ms per derivation on an
M-series Mac** (measured, 10-call average). A Vercel Hobby function's shared
vCPU is slower — assume 2–3× — so **~125–190 ms per derivation, blocking the
event loop**, is the realistic figure. `/api/auth/login` performs two
serially (competition code, then PIN); `/api/auth/players` performs one. So a
sub-200ms login budget is arithmetically impossible without changing the auth
design, and the 700 ms figure above is the honest number. Mark it as a floor,
not a failure.

Every budget above except the two Web Vitals rows is a **target, not a
measured baseline** — no production timings have been captured yet. The first
run of the §2b script establishes the baseline; **update this table with the
real p50/p95 at that point** and re-derive the targets from it. Until then,
treat a breach as "look at it", not "it regressed".

## 4) The current highest-value fixes, ranked

Derived by reading every route and access-layer module. **This supersedes the
earlier investigation that named `table-predictions/assign` as the worst
offender — that finding is stale.** `assign`, `unassign` and `submit` were
each collapsed into a single Postgres RPC by migration
`20260813020000_table_prediction_deadline.sql`, and now cost exactly one
Supabase round trip apiece. They are the _best_-performing routes in the app
and need no work.

### 1. The Pick Board Server Component (`src/app/page.tsx`) — ~11 serial round trips

The single worst path in the codebase, and the app's landing route, so it is
also the first thing every player waits on. The top-level `Promise.all` is
correct but shallow — the depth is hidden inside the loaders:

- `resolveCompetitionId` → 1
- then, in parallel, `loadPickBoardGameweek` (season → gameweek resolve
  → gameweek row → matches/picks/scores → teams/standings ≈ 6 deep) and
  `loadSeasonStats` (season → players → scores ≈ 3 deep)
- then `loadLastWeekSummary` **serially after the `Promise.all`**, because it
  needs `gameweek.number` — another ~4 deep.

Three cheap, independent wins, in order:

- **`getCurrentSeasonId` runs three times per request** (once each in
  `loadPickBoardGameweek`, `loadSeasonStats`, `loadLastWeekSummary`), plus a
  fourth equivalent `seasons` fetch inside
  `resolveCurrentGameweekForCompetition`. Resolve it once in the page and
  pass it down. Removes ~3 round trips for zero behavior change.
- **`loadTeamsById` runs twice** (current gameweek, then last week) for
  largely overlapping team sets. Hoist to one call.
- **`loadLastWeekSummary` is serialised on `gameweek.number` only.** The
  previous gameweek number is derivable in the same resolver pass, which lets
  the whole last-week branch join the top-level `Promise.all`.

Realistic outcome: ~11 serial round trips → ~4. On an APAC-to-APAC hop this
is the difference between a page that feels instant and one that doesn't.

### 2. `scryptSync` blocking the event loop on every auth call

`src/lib/auth/scrypt-secret.ts` uses the **synchronous** `scryptSync` inside
`async` wrappers. The `async` signature is a lie — nothing yields. On a
single-vCPU Hobby function this stalls the entire runtime for the duration,
so a concurrent request waits behind it rather than overlapping.

Two changes, neither of which weakens security:

- Swap `scryptSync` for the callback-based `crypto.scrypt` wrapped in a
  Promise. Same cost, same hash output, same stored format — but the event
  loop stays free. `deriveKeyHex` stays exported and its golden-value tests
  keep passing unchanged (they assert the hex output, not the call shape).
- **Stop re-deriving the competition code on every request.** Every call to
  `resolveCompetitionByCode` (`/api/auth/players`, `/api/auth/login`,
  `/api/auth/signup`) scrypt-verifies the submitted code against every
  `competitions` row. On the login screen this happens at least twice before
  a player is in. This is the most likely single cause of the "slow login"
  complaint in `LAUNCH_ORDER.md`. Any of: cache the verified
  code→competition mapping in module scope for the function's lifetime; or
  fold the code check into the login RPC so one request derives once.

**Do not "fix" this by lowering scrypt's cost parameters.** The cost is the
security property.

### 3. `/api/picks` — 4 serial round trips, two of them avoidable

`resolveCompetitionId` → `gameweeks` → `matches` → `picks` upsert. Two
specific problems:

- The gameweek-membership check `select`s **every gameweek row for the
  competition** (up to 38) and filters `matchId` in JavaScript. It should be
  a filtered query (`.or(match_1_id.eq…,match_2_id.eq…)`) returning at most
  one row.
- That membership check and the `matches` kickoff fetch are **independent** —
  they can be one `Promise.all`, or better, one RPC in the shape of
  `table_prediction_assign`, which would also make the lock check and the
  upsert atomic rather than a read-then-write with a gap in it.

This is the save-a-pick path — the interaction players hit most often during
a gameweek — so its latency is felt more than its round-trip count suggests.

### 4. `/predict-table` page — a serial tail after the `Promise.all`

`getTablePredictionRecord` then `table_prediction_ranks` run strictly after
the parallel block, and `getGameweekOneKickoff` is itself 2 deep (seasons →
matches). Depth ~5. The two trailing queries can't trivially merge (the ranks
query needs the prediction id) but a single RPC or an inner join on
`table_predictions` collapses them to one.

### 5. `table-predictions/skip` — one free parallelisation

`getPlayerForTablePrediction` and `getGameweekOneKickoff` are fully
independent and are awaited serially. `Promise.all` them. Small win, near-zero
risk, and it's the last remaining serial chain in that feature.

**Not on this list, deliberately**: `src/lib/supabase/server.ts` constructing
a fresh client per request. `createClient` is a cheap object construction with
no connection pooling to reuse — `@supabase/supabase-js` speaks HTTP to
PostgREST, and Node's global agent already handles keep-alive. Module-scoping
the client would save microseconds and introduce a cross-request shared-state
footgun. Leave it.

## 5) Cadence

Deliberately light. Nothing here runs on every PR.

- **Author self-check, every change** (§4's method, and the only mandatory
  item): if a change adds a Supabase call, count the serial depth of the path
  it lives on and state it in the PR description. Two independent awaits in
  sequence is a defect unless there's a stated reason.
- **Before a milestone / before a gameweek that matters**: run the §2b budget
  script against production, plus the §6 real-device pass.
- **Monthly**: read the Speed Insights dashboard. If a page's LCP moved,
  bisect with the budget script.
- **After any incident** ("the app felt slow on Saturday"): budget script
  first, Speed Insights second, and check `sync_log` — a sync job hammering
  the same Supabase project during a match window is a plausible cause that
  has nothing to do with app code.

No scheduled weekly CI run against production. It would burn a scheduled
workflow to produce a number nobody reads on a week where nothing changed,
and Speed Insights is already watching continuously and for free.

## 6) Real-device checklist

Real phone, cellular (not office wifi), production URL. Time by feel; anything
that makes you think "did that register?" is a finding.

- [ ] Cold login: competition code → name list appears → PIN → Pick Board.
      Note where the wait is — this is the path §4.2 targets.
- [ ] Score input: one tap focuses the field and raises the keypad.
      (`LAUNCH_ORDER.md` already records this needing two taps — confirm
      whether that's still true, it is a separate defect from latency.)
- [ ] Predict the Table: tapping a team commits visibly within ~100 ms.
      The "grey card → full contrast" lag is the known symptom; with `assign`
      now a single RPC, re-check whether it persists — if it does, the cause
      is client-side render or awaiting the response before painting, not the
      round trip.
- [ ] Band accordion open/close is smooth, no layout jump.
- [ ] Submit confirmation modal appears immediately regardless of scroll
      position.
- [ ] Switch player → back in: no visible stall.

## 7) Process guardrail

One line, added to `docs/standards/ISSUE_STANDARD.md` §3's drafting checklist
when this doc is approved:

> - [ ] **Serial round trips counted.** If the issue adds or changes
>       server-side data loading, state the serial Supabase depth of the
>       affected path and why any sequential awaits can't be parallel.

That is the whole process change. No new required CI check — per §2b, a
blocking timing gate on free-tier infrastructure fails noisily and randomly,
and the review discipline is what actually catches this bug class, since it's
visible by reading a diff.

## 8) When to revisit this document

Any of these invalidates a decision above and should trigger a rewrite of the
relevant section, not a workaround:

- Player count grows past ~50, or a second competition goes live — the
  leaderboard fold in `scoresForCompetition` reads every player and every
  score row, which is fine at 20 and isn't at 500.
- A genuinely client-heavy feature ships (charts, animation-rich views) —
  at that point front-end measurement earns its keep and §2d gets
  reconsidered.
- Playwright arrives for another reason — Lighthouse CI becomes nearly free
  once the login-scripting cost is already paid.
- Vercel or Supabase pricing changes such that a paid tier is on the table —
  most of §1's constraints are downstream of the free-tier CPU budget.
