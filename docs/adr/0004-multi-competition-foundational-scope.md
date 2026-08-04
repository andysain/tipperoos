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

**Status: grilled and resolved (2026-08-04).** The 4-agent synthesis below left three things
genuinely open — the isolation-goal question, match-edit authority, and (once that discussion
opened it up) a role model beyond a single flat `is_admin`. All three were walked through in a
`/grilling` session with Andy afterward; the outcomes are folded into the decisions below rather
than kept as a separate changelog, since they supersede rather than append to the original
synthesis.

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

3. **Route-contract changes ship now, not deferred.** `POST /api/auth/login`, `POST /api/auth/signup`,
   `GET /api/auth/players` all get their `competition_id`-aware rework immediately, ahead of the
   four not-yet-built modules in decision 2 — **grilled outcome, overriding the original
   synthesis's recommendation.** The 4-agent process below argued for deferring this to the same PR
   that actually creates a second competition, on the reasoning that stayed correct right up until
   Andy resolved the isolation-goal question: he needs **genuine funnel isolation** — actually
   exercising the competition-code-gated login flow itself, not just keeping fabricated scores off
   the real leaderboard — because that's what actually motivated this ADR (real, broken
   competition-code behavior he hit personally on Preview and Production, not a leaderboard-hygiene
   worry). Data-hygiene isolation alone would have let this stay deferred indefinitely; funnel
   isolation only exists once a second competition and its route enforcement are both real, so he
   chose to accept the schedule-collision risk (this work landing in the same window as the four
   not-yet-built modules, CODEOWNERS-gated review on `signup-validation.ts` sooner than ideal)
   rather than wait. That risk is real and was flagged, not waved away — see the original reasoning
   below, which still explains _why_ it would ordinarily be worth deferring:
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

6. **Resolved role model — Competition Admin, in-app; Superadmin, documented but not built; match
   editing, not an in-app capability at all.** The original synthesis correctly found that
   `players.is_admin` as a plain boolean doesn't even type-check for match-result edits once
   `matches` has no competition scope (#1) — that forced a real decision, and grilling it with Andy
   surfaced a cleaner shape than either of the two options originally posed:
   - **Competition Admin** (`is_admin = true`, scoped to the Competition their own `players` row
     belongs to): resets that Competition's players' PINs, and — once competition-level settings
     exist at all (e.g. a lockout duration) — administers those too. A future PIN-reset/settings
     route should check the acting admin's `competition_id` matches the target's, exactly as the
     original synthesis proposed. **Eligible for their own Competition's Season Winner** — the
     existing exclusion rule exists specifically because an admin who can also correct results has
     a credibility conflict with winning; a Competition Admin who can't touch match results at all
     doesn't have that conflict, so the letter of the old rule doesn't survive its own
     justification here.
   - **Match-result/kickoff-time correction is not an in-app capability at all, for now** —
     handled directly by the development team via database/script access, exactly matching today's
     actual state (no admin route of any kind exists in the codebase yet regardless). This
     sidesteps the original either/or entirely: nobody needs "authority" over a shared `matches`
     row inside the app because nothing in the app grants that authority yet.
   - **Superadmin** — a cross-Competition role with match-edit rights, a `players.is_superadmin`
     flag, and a login mechanism that keeps them out of any Competition's visible roster (a secret
     `competitions` row flagged e.g. `is_superadmin_gate = true`, whose roster query returns
     `where is_superadmin = true` instead of a real Competition's players) — is a **documented
     design, deliberately not built.** It solves a problem that doesn't exist yet (arbitrating a
     shared match fact across two genuinely different human Competition Admins); with one person
     administering both the real and any test Competition, "development team fixes it directly"
     already covers the actual near-term need. Build this only once a second human Competition
     Admin is real, not speculatively now — this is the same call the original synthesis made
     for a competition-management UI, applied one layer further in.

   No new column is needed for `match_result_audit` — the existing `changed_by` →
   `players.competition_id` chain already answers "which Competition was this action taken under"
   for accountability, the same transitive-scoping pattern as `picks`/`scores`. Moot in practice
   while match-editing stays outside the app entirely, but holds regardless of when/whether
   Superadmin is ever built.

7. **Exactly one Competition Admin per Competition, assigned atomically when the Competition is
   created.** Matches the existing "there is, and will only ever be, one admin for now" philosophy
   (`BUILD_PLAN.md` decision 25) rather than introducing multiple-admins-per-competition as a new
   hypothetical. Creating the row and its admin together, in one script/transaction, closes the
   partial-bootstrap failure mode the red-team agent flagged (a competition live with no admin able
   to fix anything). No self-serve competition-creation UI now — a manual script, mirroring
   `scripts/seed-fixtures.mjs`'s existing pattern, is sufficient until a real need for one exists.

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
- **A full competition-management UI, self-serve competition creation, or cross-competition
  admin/reporting views.** Not asked for, not part of this ADR's scope. A manual script, mirroring
  `scripts/seed-fixtures.mjs`'s existing one-off pattern, is sufficient for creating a first second
  competition, provided `competitions.code` has a real `unique` constraint from its first migration
  so the script can't silently collide two competitions onto the same code.
- **Building Superadmin now** (the `is_superadmin` flag, the secret gate-code, the admin-gate
  pseudo-competition) — see decision 6. Deliberately deferred, not rejected outright: the design is
  worth keeping on record for whenever a second human Competition Admin makes it a real need, but
  building it now would be solving a problem that doesn't exist yet.
