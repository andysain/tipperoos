# Build order — where the season actually is

Working checklist. Rewritten 2026-09-04 after an audit against the GitHub issue list; the launch-wave structure it used to carry is now history and lives in §1.

Launch happened. Gameweek 1 opened 2026-08-21, and the **Minimum Launch — Gameweek 1** milestone is fully closed — all 20 issues. What follows is the live backlog, ordered.

---

## 1. History — what launch and the weeks after it delivered

Kept short deliberately. The issues themselves hold the detail, and `BUILD_PLAN.md` holds the sequencing reasoning.

**Launch (milestone closed).** Sync workflow and `sync_log` (#11, #12) · Match 1 and Match 2 auto-selection (#18, #19) · Tipped Match card and pick route (#15) · server-side pre-kickoff lock (#16) · Pick Board (#90) · current-gameweek resolver (#86) · kickoff formatting (#87) · standings store (#88) · gameweek 1 seed (#89) · card primitives and cross-screen chrome (#106, #107, #108) · in-app help (#125) · login and Predict the Table polish (#126–#132).

**After launch.** Scoring engine (#21) and its scripted simulation (#22) · standings snapshot (#23) · sync wired to scoring (#166) · per-gameweek selection runner (#92) · bot picks (#35) · leaderboard (#24) · Match Centre and the hidden-until-lock rule (#91, #17) · design-system sweep and its follow-ons (#184, #185, #186) · Predict the Table Band capture and scoring (#115–#118), the Table Prediction Strip (#156), its live score (#157), and the leaderboard segment (#171).

**Defects found and fixed in flight.** `seasons.is_current` defaulting true, 500ing every route (#174) · the unbounded `scoresForCompetition` query against Supabase's 1,000-row cap (#176, #182) · session cookie with no `maxAge`, logging mobile players out (#196) · leaderboard rank arrows stuck on `–` (#202) · dense-to-standard rank tie-break (#204).

**Performance.** One investigation, not three fixes. Server-side round trips came down (Pick Board ~11 serial → ~6; `/predict-table` 3 serial stages → one 5-way parallel wave; `/api/picks`, `table-predictions/*` parallelized or collapsed to single RPCs), and Vercel moved to the APAC region. But a real-device Chrome trace found the dominant cause wasn't server-side at all: every tap paid a ~230ms double-tap-zoom disambiguation delay because no `touch-action` was declared anywhere. `touch-action: manipulation` on `body` took INP from ~280ms to ~80ms on a real device. Detail in `docs/standards/PERFORMANCE_TESTING_STANDARD.md` §4.

---

## 2. Open backlog — every open issue, ordered

Ten open issues. Ordered by what actually costs something today, not by milestone.

### Correctness gaps — nothing else should jump these

- [ ] **#33 — Postponement-void handling.** The Skipped Slot and Voided Match card states are still undrawn (`docs/adr/0007` → _Deferred_). A postponed tipped match today has no defined behaviour on the Pick Board, and the rule it needs to implement is the one point of unprompted agreement across every analysis of this rebuild — a post-lock postponement voids, a pre-lock one skips the slot. Live risk for the rest of the season.

- [ ] **#36 — Player-facing forced-PIN-reset route and screen.** `pin_reset_required` is in the schema and `/api/auth/login` returns it, but `src/app/login/page.tsx:169` deliberately ignores it — the comment says the flow isn't built and the old dead-end warning was removed. There is no set-new-PIN route under `src/app/api/auth/`. **Setting the flag today does nothing at all.** Rescoped 2026-09-04 to the player-facing half only; the admin-side write is #201. Doesn't depend on the admin UI — the flag can be set by SQL to test it — so it can go first, and should.

### Admin UI — Phase 1 of `docs/admin-ui-spec.md`

Spec merged in #198. Phases 2–5 (sync page, player details and roles, competition code rotation, settings) are specced but unfiled; file them when Phase 1 lands, not before.

- [x] **#199 — Admin access gate + `/admin` shell.** `requireAdmin()`, 404-not-403 for non-admins, More-menu entry. Merged (PR #208).
- [ ] **#200 — Roster table + health strip.** Read-only. #199 has merged. This is what makes a silently-failed sync visible at all; today that's only discoverable by querying `sync_log` by hand.
- [ ] **#201 — Admin reset PIN + clear lockout.** Blocked on #199, #200 and, for the flow to mean anything, #36. Touches `src/lib/auth/**` → CODEOWNERS approval required.

### Infrastructure the spec assumes and we haven't built

- [ ] **#13 — pg_cron health-check watchdog.** `CLAUDE.md` → Stack specifies it as the secondary check that a successful sync happened recently, alerting the admin if not. `status: ready`, never scheduled. Overlaps #200's health strip: the strip tells you when you look, the watchdog tells you when you don't. Decide whether both are wanted before building the second one.
- [ ] **#39 — Weekly backup export.** `CLAUDE.md` → Stack calls this a rolling data safety net for the season, not a pre-launch one-off. It doesn't exist. Distinct from the admin-export tooling that `docs/admin-ui-spec.md` D7 rules out — this is a scheduled job, not a UI.

### Deferred by decision, 2026-09-04

- [ ] **#28 / #29 / #30 — Transactional email + the two sends.** **Andy is delaying this for the time being.** Noted because `CLAUDE.md` calls the post-result push the single highest-leverage retention lever in the product, so this is a deliberate deferral to revisit, not a quiet drop. One consequence worth holding: with no email, a player who can't get in has no channel to be reached on, which is part of why #36 matters.

### Needs a decision, not code

- [ ] **#31 — Match-result edit audit trail.** #14 (admin override UI for results and kickoff times) was closed as not planned on 2026-09-04 — match-result correction stays a development-team database action per `CLAUDE.md` → Identity and auth and D2 of `docs/admin-ui-spec.md`. That leaves this issue without its trigger. `match_result_audit` exists in the schema and nothing writes to it. Either rescope to capturing hand-made corrections (which `CLAUDE.md` promises are visible on the pick reveal), or close it and let the table sit unused. Not picked yet.

---

## 3. Wanted, no issue filed

Concrete enough to file whenever there's appetite:

- **Type-ahead login search** — replace the full player list with a filtered dropdown of close matches only, never the whole roster. Balances usability for younger players against exposing an enumerable name list as the group grows. **M**. Note this is load-bearing for `docs/admin-ui-spec.md` §6.2: disabling a player is enforced server-side at login precisely because absence from the roster list is presentation, not enforcement.
- **Pick Board card text reorder** — match and pick metadata up top in line with the `OPEN` chip, score prediction on its own line, so the key element isn't sharing space.
- **Score input needs two taps** before the number pad appears. **XS**.

Genuinely undecided — don't file these as issues yet:

- **Score input redesign** (buttons vs. free text), which must also resolve the "single digit on 5+" case: multi-digit entry above the valid range currently fails with a vague error instead of being prevented or explained. **M**.
- **Post-lock Predict the Table visibility** — mirror the weekly pick reveal so other players' full tables become visible after lock, alongside a comparison against actual standings.

---

## 4. Deferred deliberately

Offline/retry states for the filing stamp · the ambient countdown treatment · remembering the `5+` row per player · the last-place Picker mechanic (#20, closed `not planned` — reopen to revive; its `gameweeks` columns are retained as reserved space) · Superadmin role · WhatsApp · admin-side match-result and kickoff editing (#14, closed `not planned` 2026-09-04).

---

## Per-issue workflow

Per `AGENTS.md`, unchanged:

1. `git fetch && git rebase origin/main`, one worktree per issue, branch from `origin/main`.
2. Re-run the **current-state check** (`docs/standards/ISSUE_STANDARD.md` §4) before writing code. This audit found two issues whose bodies had drifted from the code — assume yours has too.
3. Tests per `docs/standards/TESTING_STANDARD.md` §1; golden values where the issue says so.
4. Validation sequence, then **open the Preview URL and exercise the flow yourself**.
5. PR with a plain-language **TL;DR** first line, then `gh pr merge --auto --squash`.
6. Delete the worktree and branch the moment the PR merges.

Anything touching `src/lib/**` or `.github/workflows/**` needs Andy's explicit approval before merge (CODEOWNERS). In the current backlog that's **#201**, and likely **#33** depending on where the void logic lands.
