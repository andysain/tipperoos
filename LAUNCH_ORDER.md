# Build order — Minimum Launch, Gameweek 1 (2026-08-21)

Working checklist for the **Minimum Launch — Gameweek 1** milestone. Not committed; scratch file.

Launch is defined as: _a player logs in, lands on the Pick Board, sees gameweek 1's two auto-selected Tipped Matches, and files a scoreline that a server-side lock enforces._ Source of truth for scope is `BUILD_PLAN.md` decision 42; the design decisions are `docs/adr/0006-auto-selected-tipped-matches.md` and `docs/adr/0007-home-surface-and-pick-entry.md`.

```
#87 ──> #15 ──> #16          critical path (4 deep)
              └> #90
#18 ──> #19 ──> #89 ──┘
#86 ──────────────────┘
#88 (migration, standalone)
#11 (sync cadence, standalone — wave 1)
```

---

## Per-issue workflow (every item below)

Per `AGENTS.md`:

1. `git fetch && git rebase origin/main`, one worktree per issue, branch from `origin/main`.
2. Re-run the **current-state check** (`docs/standards/ISSUE_STANDARD.md` §4) before writing code — several of these issues already have partial implementations upstream.
3. Tests per `docs/standards/TESTING_STANDARD.md` §1; golden values where the issue says so.
4. Validation sequence, then **open the Preview URL and exercise the flow yourself**.
5. PR with a plain-language **TL;DR** first line, then `gh pr merge --auto --squash`.
6. Delete the worktree and branch the moment the PR merges.

Anything touching `src/lib/**` needs your explicit approval before merge (CODEOWNERS) — in this set that's **#16**, and likely **#18**/**#19**/**#86** depending on where the pure logic lands.

---

## Wave 1 — four in parallel, all `status: ready`

- [x] **#88 — Team league-position store + standings fetch**

  _Only migration in the set. Run it alone so nothing races it in `supabase/migrations/**`._
  **Migration discipline (`CLAUDE.md` → Stack):** apply to staging → confirm → apply to production → only then merge the branch that depends on it.

- [x] **#87 — Kickoff and countdown display formatting (Sydney)**

  _Head of the critical path. #15 cannot start without it._

- [x] **#86 — Shared current-gameweek resolver**

  _No dependents until #90._

- [x] **#18 — Match 1: Top Matchup auto-selection rule**

  _Head of the selection chain. Pure logic; positions are an input, so it does not wait on #88._

- [ ] **#11 — GitHub Actions sync workflow**

  _Moved into wave 1 from the "Open gap" below (decision made 2026-08-14 via `/ship`): #88's standings sync assumes this cadence exists, and a rescheduled GW1 fixture has no mechanism to correct its pick-lock time without it. See #11's own decision log for the build shape._

## Wave 2 — two in parallel

- [x] **#19 — Match 2: uniform-random rule** (after #18)
- [x] **#15 — Tipped Match card + pick save/edit route** (after #87)

  _Decide optimistic-vs-awaited filing deliberately here — the deferred offline/retry states constrain this route's contract, so reversing it later means changing the signature._

## Wave 3 — two in parallel

- [x] **#16 — Server-side 5-minute pre-kickoff lock** (after #15)

  _The one launch item that must be **correct**, not merely present. The predicate `isMatchLocked` already exists in `src/lib/competitions/scope.ts` (#80) — reuse it; this issue owes enforcement on the **write** path._

- [x] **#89 — Gameweek 1 Tipped Match seed script** (after #18, #19)

## Wave 4 — one

- [x] **#90 — Pick Board route (`/`)** (after #86, #87, #15)

  _Also needs #89 in practice: no gameweek exists to render or to exercise on Preview until the seed script has run._
  _Includes the login redirect — login currently dead-ends into `/predict-table`._

---

## Predict the Table deadline

- [x] **#26 — Predict the Table capture UI.** The table is editable through the end of 31 August 2026 in Australia/Sydney, then locks for on-time Players. Late Joiners remain unrestricted. **Run as an independent track, not after the picks work.**

## Pre-kickoff, not tracked as issues

- [x] Run the #89 seed script against **production**, not only staging.
- [x] Confirm production and staging schemas match (no drift from #88's migration).
- [ ] Walk the deployed Production URL end to end as a real player: enter competition code → sign up → file both picks → re-edit one → confirm the other players' picks are not visible anywhere.
- [x] Confirm at least one other household can log in on their own device.

---

## After launch, in order

1. **#21 — Additive scoring engine.** Within days, not weeks: gameweek 1's results land 21–23 August and the Pick Board shows no points, rank or last-week strip until this runs.
2. **#23 — Per-gameweek standings snapshot.** Lights up rank and the last-week strip on `/`.
3. **#92 — Per-gameweek selection runner.** Hard deadline of gameweek 2, roughly 28 August.
4. **#91 — Match Centre** (+ **#17** visibility rule). The read-path `picksForMatch` already exists; this is the surface that consumes it.
5. **#24 — Leaderboard view.**
6. **#28 / #29 / #30 — Transactional email + the two sends.** `CLAUDE.md` calls the post-result push the highest-leverage retention lever in the product; don't let it drift behind the reminder.
7. **#35 — Bot picks** (Random, 1-1, Median).
8. **#33 — Postponement-void handling**, plus the Skipped Slot and Voided Match card states, which are still undrawn (`docs/adr/0007-home-surface-and-pick-entry.md` → _Deferred_).

## Still deferred, deliberately

Offline/retry states for the filing stamp · the ambient countdown treatment · remembering the `5+` row per player · the last-place Picker mechanic (#20, closed — reopen to revive) · Superadmin role · WhatsApp.

# TO DO

Sizes are rough t-shirt estimates (XS ≈ &lt;1hr, S ≈ half day, M ≈ 1–2 days, L ≈ 3+ days), not commitments.

- [ ] PRE Launch

  _Bar for PRE: either blocks a player from cleanly completing signup → pick filing → Predict the Table capture before gameweek 1 lock, or is cheap enough that deferring it buys nothing._
  - [x] General
    - [x] **#125 — In-app help: scoring + mechanics explainer** — **M**
    - [x] **User Better team names than the full full names**
  - [x] Login / Onboarding
    - [x] When logging in remove the "**Welcome back, Test2345!** You're logged in. Let's Go" screen. Have it just go straight to the home page
    - [x] **#126 — Login/signup polish: mask PIN on login, hide email input** — **XS** (bundles the PIN-mask and email-hide items)
    - [x] **#127 — Make emoji selection mandatory + add random-pick button** — **S** (`cut-if-behind`: the full emoji-library tier)
  - [x] Pick Board
    - [x] **#128 — Pick Board: show calendar date alongside kickoff time** — **S**
    - [ ] Show the viewing player's own Champion pick (from Predict the Table) on the pick board, as a personal reference chip
  - [x] Predict the Table
    - [x] new predict the table input approach
    - [x] **#129 — Fix "locked in" confirmation to a fixed modal** — **S**
    - [x] **#130 — Band-by-Band guidance (next-prompt + progress tracker)** — **M**
    - [x] **#131 — Placed-team X marker + tap-to-swap interaction** — **M** (bundles the X-marker and swap items)
    - [x] **#132 — Extend lock deadline to 31 August** — **S**

- [ ] POST Launch
  - [ ] Performance
    - [x] Investigate shared server-side root cause behind slow login, slow screen loads/saves, and the laggy "grey card → full contrast" team-add commit on Predict the Table — treat as one investigation, not three separate fixes. Fix root cause only; no optimistic-UI masking. — **M** (investigation), follow-on fix size TBD by finding - partly resolved by having vercel moved to apac region. Investigation and remediation plan live in `docs/standards/PERFORMANCE_TESTING_STANDARD.md` §4. `table-predictions/assign`/`unassign`/`submit` already collapsed to single RPCs (pre-existing migration); scrypt now non-blocking + competition-code lookup cached; Pick Board (`src/app/page.tsx`) season/gameweek resolution deduped and last-week summary moved into the parallel wave (~11 serial round trips → ~6); `/api/picks` membership check + kickoff-time lookup parallelized (filtered query instead of a full gameweeks scan); `table-predictions/skip`'s two independent reads parallelized; `/predict-table` collapsed from 3 serial stages to a single 5-way parallel wave plus one dependent tail query. A real-device Chrome trace of the Pick Board found the actual dominant cause was not server-side at all: every tap paid a ~230ms browser double-tap-zoom disambiguation delay (`GestureTapUnconfirmed` -> `GestureTap`) because no `touch-action` was declared anywhere in the app. Fixed with `touch-action: manipulation` on `body` — **confirmed on a real device**: INP dropped from ~280ms to ~80ms, matching localhost.
  - [ ] Login / Onboarding
    - [ ] Replace the full player list on login with type-ahead search: as the player types, show a small filtered dropdown of close/partial matches only — never the full roster — balances usability for younger players against not exposing an enumerable name list as the group scales past ~5 — **M**
  - [ ] Pick Board
    - [ ] Reorder text on card. so that the match/pick meta data is up top in line with the `OPEN` chip. and the score prediction has its own line (idea is that this is the key item so it should maximise the space on the card not have to share it
    - [ ] Fix score input requiring two taps before the number pad/cursor appears — **XS**
    - [ ] Reorder Match 1 / Match 2 by kickoff time (chronological), Top Pick as tiebreak only — supersedes the current fixed Match-1-first ordering in `docs/adr/0007` — **S**
    - [ ] Decide on redesigning the score input (buttons vs. free text) — must resolve the "single digit on 5+" case too: multi-digit entry above the valid range currently fails with a vague error instead of being prevented or clearly explained — open design question, not committed — **M**
  - [ ] Predict the Table
    - [ ] _Future direction, not committed:_ after lock, mirror the weekly pick visibility rule — other players' full Table predictions become visible, plus a comparison against actual current standings
  - [ ] Leaderboard
    - [ ] Build it  - **Due by end of Gameweek 1**
  - [ ] Match Centre
    - [ ] Build it
