# Multi-competition foundational scope

Produced via a 4-agent adversarial fan-out / cross-examine / synthesize process (Data Model &
Migration, Auth & Security, Red-team, Product/Scope-discipline), mirroring the process that
produced `BUILD_PLAN.md`. Each agent independently investigated the live codebase, then read and
rebutted the other three's findings in a second round before this synthesis. Two full rounds are
preserved for anyone who wants the underlying argument, not just the conclusion — ask if you want
them surfaced; they aren't checked in.

**Trigger**: Andy wants a safe way to run a test competition in production, without risking or
mixing real family-competition data. This ADR is not a decision to build the full multi-competition
feature now — it's the answer to "what foundational groundwork, if any, is worth doing now so that
building it later (or running a lightweight test cohort now) doesn't require an expensive retrofit."

## Decision

1. **Add a `competitions` table, plus `competition_id` on `players` and `gameweeks` only, now** —
   nullable → backfilled to a single seeded "default" competition row → `NOT NULL`, one migration,
   staging then production. Both tables are empty or near-empty in production today, so this is
   near-zero migration risk, touches no CODEOWNERS-gated code, and doesn't invalidate any session
   (the signed cookie carries only a player id; `competition_id` is always looked up fresh from the
   DB).
   - `matches`, `teams`, `seasons`, `sync_log` **must never** get a `competition_id`. They're real
     Premier League facts, not competition data — two competitions tipping the same live season
     must reference the same fixture rows (`(provider_name, provider_match_id)`), or fixture sync
     duplicates 380 rows per competition and re-runs N times for identical external data, breaking
     the "match on a stable external fixture ID" sync invariant. This corrects `BUILD_PLAN.md`
     decision 35, which listed `matches` as needing `competition_id` — that was wrong; decision 35
     is amended by this ADR.
   - `picks`, `scores`, `standings_snapshots`, `table_predictions`/`table_prediction_ranks` do
     **not** get a direct `competition_id` column. They scope transitively through `player_id`
     and/or `gameweek_id`, both of which carry `competition_id` once scoped. Adding a redundant
     column here would be denormalization with no query benefit at this table size, and a second
     source of truth that could drift from the real one.
   - `competitions.code` is stored hashed (`crypto.scrypt`, mirroring `players.pin_hash`), not
     plaintext — a migration file seeding a competition row is committed to git history, and a
     plaintext code there is a real, avoidable leak. `competitions.id` is `uuid`, matching every
     other table's convention and closing most of the competition-id-enumeration risk below for
     free. Verifying a submitted code stays an app-level `timingSafeEqual` loop over the (always
     tiny) `competitions` table, preserving today's exact security properties, rather than a raw SQL
     `WHERE code = ?` — cheap to do, not because the timing risk is real at this scale (it isn't —
     "this is not a bank," per CLAUDE.md), just because it costs nothing extra once the call site is
     already being touched.

2. **The four not-yet-built consequence-critical modules — scoring, lock enforcement,
   postponement, the Match-2 picker — must be built against the scoped `gameweeks`/`players` shape
   from their first commit, not retrofitted later.** This is the actual argument for doing #1 now
   rather than waiting: none of these five CODEOWNERS-gated modules exist yet except PIN/lockout, so
   "foundational now" here means writing code that doesn't exist yet in its correct shape, not
   reopening tested, live logic. Doing this after these modules ship (e.g., mid-Week-3, or worse,
   mid-season once real gameweeks/standings exist) would be a genuinely expensive retrofit against
   live data, in the tightest part of the build schedule. This is the one place "build it now" is
   cheaper than "build it later," and it's the whole justification for #1.

3. **No route-contract changes ship yet.** `POST /api/auth/login`, `POST /api/auth/signup`,
   `GET /api/auth/players` keep their current queries — no `competition_id` filters added now, no
   change to `verifyCompetitionCode`, no change to the login request shape. These all ship **in the
   same PR that actually creates the second `competitions` row**, never as an independently
   mergeable "foundational" follow-up. Reasoning, converged on independently by three of the four
   agents:
   - With exactly one `competitions` row in existence, a forgotten `.eq("competition_id", ...)`
     predicate is a no-op — there's nothing to leak across yet. That window is safe.
   - Enforcement code merged and sitting inert while only one competition exists is untested in the
     only way that matters: there's no real second-tenant data to prove it actually excludes
     anything. A subtle bug (wrong column, a branch of a query that doesn't get the filter) could
     sit invisibly wrong until the exact moment it's live and dangerous.
   - It avoids paying CODEOWNERS review cost now on `src/lib/auth/signup-validation.ts` (where
     `verifyCompetitionCode` lives — one of the five gated modules) for logic with zero behavioral
     effect yet.
   - The login-ambiguity problem this fix has to solve (`display_name` uniqueness moving from
     global to per-competition breaks `POST /api/auth/login`'s current `ilike(displayName)
.maybeSingle()` global lookup) literally cannot occur with one competition — there is nothing
     to defer that has any present cost.
   - When it does ship: the client must **not** be trusted to assert a bare `competitionId` in the
     login request. That reopens the exact enumeration surface the code-gate exists to close (probe
     `competitionId` × guessed names, using the 423-vs-401 response shape as an existence oracle).
     The correct shape is the client sending the competition **code** it already holds (proven
     available client-side today via `login/page.tsx`'s stored-code state), with the server
     re-deriving `competitionId` server-side the same way the roster route already does — the
     login route inheriting the same trust boundary the players route already enforces, not a new,
     weaker one.

4. **Write one invariant into `CLAUDE.md` or `AGENTS.md`'s non-negotiables list now, at zero cost,
   before any of the code it governs exists.** This is the single highest-priority output of this
   whole exercise — the one finding that is simultaneously highest-blast-radius, silent (not a
   crash), requires no attacker, and is guaranteed to trigger on the very first real use of
   whatever ships, not eventually:

   > `matches`/`teams`/`seasons` are global by design and carry no `competition_id`. Any query that
   > filters or joins on `match_id` alone does **not** carry competition scope — it must
   > additionally join through `players.competition_id` (for `picks`/`scores`) or
   > `gameweeks.competition_id` (for gameweek-level aggregates). This applies identically to
   > player-facing reads (the leaderboard, Match Centre pick-reveal) and to admin actions.

   Why this matters more than the roster-leak risk it sits alongside: `GET /api/auth/players`
   forgetting its filter has one fix site and a narrow blast radius (a display-name list, low
   sensitivity in a 10-20 person group who already know each other). A `match_id`-keyed query
   forgetting to scope through `player_id` has an _open-ended_ number of future fix sites — the
   Week 2/3 leaderboard and post-lock Match Centre pick-reveal are the first two, and both are
   guaranteed to be exercised immediately: Match 1 is randomly auto-selected from the same shared
   fixture pool every gameweek, so a concurrent test competition colliding with the real one on the
   same real fixture is a near-certainty within a few gameweeks, not a hypothetical. When it happens
   unguarded, it doesn't just disclose a name — it corrupts the leaderboard (the exact integrity
   property CLAUDE.md's scoring section exists to protect) and breaches the pre-lock pick-secrecy
   mechanic CLAUDE.md treats as a first-class rule. This risk is also **design-agnostic**: it applies
   identically whether isolation is ever delivered via this `competitions` table or a cheaper
   boolean-flag approach, because the mechanism is `matches` staying global, not whichever column
   distinguishes cohorts.

5. **Build a structural backstop for #4, not just a documented rule, before the Week 2
   leaderboard/Match-Centre routes are written.** A single shared server-side query helper (e.g.
   `scoresForCompetition(competitionId)`, `picksForMatch(matchId, competitionId)`) that always
   requires and enforces a `competitionId` parameter turns "a rule everyone has to remember" into "a
   rule the type signature enforces." Costs nothing today (no such routes exist yet), doesn't touch
   CODEOWNERS-gated code on its own, and removes the dependency on every future contributor
   (including a future agent session with no memory of this ADR) independently rediscovering #4.

6. **Match-result/kickoff-time edit authority needs an explicit decision before any second admin
   identity of any kind exists** — this ADR does not make that call. `players.is_admin` is a plain
   boolean with no competition dimension, which is fine for `players`-scoped admin actions
   (a future PIN-reset route can and should check the acting admin's `competition_id` matches the
   target player's), but **does not even type-check** for match-result edits, since `matches`
   correctly has no competition scope at all (#1). Two honest options, not resolved here:
   - Match-edit authority is **not** competition-scoped — any admin, in any competition, can
     correct any shared match's result, because a wrong score is an objective fact and correction
     isn't a competition-scoped privilege. (Leaning option, given CLAUDE.md's implicit framing of
     match results as objective facts throughout the postponement/audit rules — but this is a
     product/trust-model call, not a security one, and Andy should make it explicitly.)
   - Match-editing stays restricted to a single designated admin, sidestepping the question by
     never having more than one admin identity with this specific capability.

   No new column is needed for `match_result_audit` either way — the existing `changed_by` →
   `players.competition_id` chain already answers "which competition was this admin acting under"
   for accountability purposes, the same transitive-scoping pattern as `picks`/`scores`. A dedicated
   `competition_id` column on the audit row would overspecify something that doesn't have a single
   true value once (6) is decided either way.

## Rejected

- **A `players.is_test` boolean flag instead of a `competitions` table** (the product agent's
  original round-1 proposal). Retired by its own author in round 2, for a concrete reason beyond
  cost: it has no gameweek-level boundary at all (test and real players would tip the identical
  Match 1/Match 2 selection every week), which lets a test player's deliberate edge-case pick skew
  the Median Bot's post-lock prediction for the _real_ competition — corrupting a real scoring
  artifact, not just a display leak. It also carries the identical `match_id`-keyed leak risk as
  the `competitions` design (see decision 4), and arguably a _worse_ version of it: a boolean
  sitting next to `is_bot`/`is_admin` — two existing flags that are legitimately optional to filter
  — carries a weaker "you must always filter this" signal than a foreign key would, purely because
  of what it looks like to a future implementer pattern-matching against its neighbors, not because
  of any technical property of booleans vs. FKs. If a cheaper-than-`competitions` need ever
  resurfaces, revisit with this failure mode named explicitly, not as a bare flag.
- **Scoping `matches`/`teams`/`seasons` per competition** (BUILD_PLAN.md decision 35's original
  text). Actively worse than leaving it global, not just unnecessary — it would multiply the
  attack/bug surface (every fixture-sync write, every result-entry action, every match-status
  transition would need a competition check) for zero confidentiality benefit, since match results
  are public sporting facts, not private competition data.
- **Route-contract changes and the login-ambiguity fix shipping now, independently of a second
  competition actually existing.** See decision 3 — deferred, not rejected, but explicitly not part
  of "foundational now."
- **A full competition-management UI, self-serve competition creation, or cross-competition
  admin/reporting views.** Not asked for, not part of this ADR's scope. A manual script, mirroring
  `scripts/seed-fixtures.mjs`'s existing one-off pattern, is sufficient for creating a first second
  competition, provided `competitions.code` has a real `unique` constraint from its first migration
  so the script can't silently collide two competitions onto the same code.

## Open question for Andy

What does "safe test competition in production" actually need to verify? Two readings that this
ADR's decision 3 (defer route contracts) treats differently:

- **Data-hygiene isolation** — keep fabricated scores/standings out of the real leaderboard. Fully
  satisfied once decision 3's route contracts ship, whenever competition #2 is actually created.
- **Genuine funnel isolation** — also exercise the competition-code-gated signup/login flow itself
  (today's biggest untested surface: `POST /api/auth/login` doesn't check the competition code at
  all, confirmed by reading `src/app/api/auth/login/route.ts` and `src/app/login/page.tsx` — it
  relies entirely on the roster route's gate having already run). This reading requires decision 3's
  work to actually ship before it's testable, not just the schema in decision 1.

Neither the schema decision (1) nor the module-scoping decision (2) depends on which reading is
correct — both cost the same either way. But it determines when decision 3's deferred route work
actually needs to land, and whether "a test competition in production" is meaningfully available
before then. Worth answering before treating this ADR as fully closed.
