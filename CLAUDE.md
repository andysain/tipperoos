# Tipperoos — Premier League Tipping Competition (Product Spec)

## Status

This supersedes the previous World Cup version of this app (Streamlit + Supabase). That app is retired; its code is recoverable via the `worldcup-2026-final` git tag and prior commit history. This document is the durable product reference — the **what**. For the initial launch's phased execution, decisions log, rejected alternatives, and open risk triggers, see `BUILD_PLAN.md` — the **how/when**. If the two ever disagree, this document wins for product behavior; `BUILD_PLAN.md` wins for build sequencing of the initial launch only.

## Purpose

A friendly Premier League tipping competition for a small private group (~10–20 players across several households, family/friends, ages ~10+, with a few automated bot players). Same theme and general player pool as the retired World Cup version, but functionally a different product: an ongoing ~38-gameweek season with a small, curated weekly tipping surface, not a short tournament.

Do not build a general tournament/sports platform. Build for this specific private group.

## Hard constraints

- Free or near-free hosting only. No paid always-on infrastructure.
- Mobile-friendly, fast, and responsive — this is an explicit reaction against the old Streamlit app's clunkiness/slowness. Snappy interaction is a product requirement, not a nice-to-have.
- Kid-friendly language and UI (players as young as ~10).
- Private competition: no open public registration. New players may create themselves only if they know the private competition code.
- No gambling language or mechanics. Use `prediction`, `pick`, `points`, `leaderboard`, `competition`. Avoid `bet`, `odds`, `wager`, `stake`, `payout`, `bookie`.
- No chat, comments, public profiles, or social features beyond the leaderboard and Match Centre.
- Kickoffs are UK time. Store all timestamps and do all lock/deadline comparisons in UTC. Render kickoff labels as weekday, short local calendar date, and time in the viewer's browser-detected local timezone (resolved via a `tz` cookie the client keeps in sync with `Intl.DateTimeFormat().resolvedOptions().timeZone`; falls back to `Australia/Sydney` before that cookie exists). Email notifications are the one exception — sent server-side with no browser to read a timezone from, they render in a fixed `Australia/Sydney` instead. See issue #93 for the full reasoning and rejected alternatives.
- All lock/deadline enforcement is server-side, always. Never trust a client clock or a merely-disabled UI control.

## Stack and architecture

- **Next.js on Vercel**, full JS. No Python in the live app — this was a deliberate call, not an oversight; see _Explicitly out of scope_ for what that ruled out.
- **Supabase Postgres** (fresh project, not the old World Cup project) as the backend, plus a **second free Supabase project as a staging environment** for the week-3 dry run and general testing, so testing never runs against the same project going live for real players. Free tier allows 2 active projects per org.
- **Ongoing backup**: a lightweight weekly export of the live project's tables (same REST-export pattern used for the old project's one-time backup), so the new project has a rolling data safety net during the season, not just a pre-launch one-off.
- **Three-environment mapping**, all free on Vercel's Hobby tier:

  | Environment | Where it runs                                            | Supabase project                                    |
  | ----------- | -------------------------------------------------------- | --------------------------------------------------- |
  | Local dev   | `next dev` on your machine                               | staging (`.env.local`, gitignored)                  |
  | Preview     | Vercel auto-deploys every branch push/PR to a unique URL | staging (Vercel env vars scoped to "Preview")       |
  | Production  | Vercel deploys `main` to the real domain                 | production (Vercel env vars scoped to "Production") |

  Discipline this requires: apply any schema migration to staging first, confirm it, then apply the same migration to production before merging the branch that depends on it — schema drift between the two is the main failure mode.

- **Auth is not Supabase Auth.** Login is application-level (email + PIN, see below), so Postgres RLS cannot key off `auth.uid()`. Consequence: **all reads and writes must go through server-side Next.js API routes** — never a direct client-side Supabase call, anywhere, ever. This is the single biggest security invariant in the app; violating it is how a technically-minded player reads other players' pre-lock picks via devtools.
- **Fixture/result sync**: a GitHub Actions scheduled workflow is the primary mechanism (~10–15 min cadence on match days) calling a Vercel API route, which calls a free football data API (e.g. football-data.org — confirmed free tier includes the Premier League, at 10 calls/minute). All 380 season fixtures are seeded once from published data; the API is used only for deltas — kickoff-time changes and results — never to discover fixtures. Each sync cycle must be **one batched date-range call**, not one call per fixture, to stay comfortably inside the free-tier rate limit. Match on a stable external fixture ID, never team-name+date.
- A lightweight Supabase pg_cron job runs as a secondary **health-check watchdog only** (not the sync itself): confirms a successful sync happened recently and alerts the admin if not.
- **Email, not WhatsApp**, is the notification channel (see _Notifications_). WhatsApp is a deferred future add-on.

## Identity and auth

- **Display name + PIN.** `display_name` is the required, unique (case-insensitive) identity key and login selector — reverted to this from an email-based identity model earlier in planning (see `docs/adr/0002-email-optional-display-name-identity.md`). Format: 2–20 characters after trimming, letters/numbers/spaces/apostrophes/hyphens only (emoji has its own field, see below). PIN is a fixed 4 digits, hashed with Node's built-in `crypto.scrypt` (no new dependency). This is not a bank; don't add heavier auth than that.
- **Email is optional and not unique.** Not every player has their own address; siblings may share a parent's. It exists purely as an optional notification-delivery field — never used for login or as an identity key. Consequence: not every player will receive the pre-lock reminder or post-result score/rank emails; accepted trade-off.
- Login UX is unchanged from the old app's spirit: pick your display name from a list, enter your PIN. No per-login email round-trip (ruled out OTP/magic-link login specifically because it reintroduces friction on a shared family device, and email isn't reliably on file for every player anyway now).
- **The private competition code gates the whole login screen, not just signup.** A visitor enters it once before seeing the display-name list at all (the list itself is a private-roster API, not publicly readable without the code); a returning device remembers a code that has already worked so this isn't asked on every visit, only from a device that's never proven it before. Login and signup share this one code-gated entry flow rather than being separate screens — picking a name logs in, "join instead" signs up, and a code already verified in that visit carries over to either path without retyping it.
- **Session**: a stateless signed cookie (player id + HMAC signature via a server-side secret) — no DB sessions table, no expiry. Persists until the player explicitly uses "Switch player." Sufficient for the shared-device threat model; a revocable server-side session table would be solving a problem that doesn't exist here. Signing up counts as logging in — a new player lands in a signed-in state immediately, not a separate login step afterward.
- Each player picks an **emoji** at signup — mandatory — shown next to their name in the login list and leaderboard; a small kid-friendly personalization touch carried forward from the old app. The pick is one of a curated kid-appropriate library (see `src/lib/auth/emoji-options.ts`): a grid of 10 classics, or a random draw from the full library. The signup API rejects signups without one.
- New players self-create only with the private competition code, checked against a hashed value stored on the `competitions` row (`code_hash`, scrypt, same format as PIN hashing) — not an env var and not plaintext, so the code never appears in git history or Vercel's env var UI. Set per environment with `scripts/set-competition-code.mjs`, run once per Supabase project (see `README.md`).
- **Lockout**: 5 failed PIN attempts locks the account for 15 minutes (auto-expires, no admin action needed for the common case). A successful login resets the failed-attempt counter.
- **Forgot-PIN reset (admin-assisted, forced-reset flow)**: admin sets a temporary PIN (typed by the admin, communicated to the player directly — no delivery mechanism needed since it's in-person/by phone) and flags the account as needing a reset. The player logs in with the temp PIN and is forced to choose a real new PIN before reaching the app; the reset flag then clears, along with any lockout state.
- **Admin is a two-tier role, scoped per competition** (see `docs/adr/0004-multi-competition-foundational-scope.md` for the full reasoning): a **Competition Admin** (`is_admin = true`, scoped to their own competition) can still play for fun and, unlike an earlier single-tier version of this rule, **is eligible for their own competition's season "winner" title** — their one elevated capability (resetting another player's PIN, plus administering that competition's settings once any exist, e.g. a lockout duration) can't influence scoring, so the credibility conflict that would otherwise justify excluding them doesn't apply. **Match-result and kickoff-time correction is explicitly not a Competition Admin capability.** For now it's a development-team database action, not an in-app capability at all — matching the app's actual current state, since no admin route for it exists yet. A future **Superadmin** role (cross-competition match-result correction, deliberately kept off every competition's visible login list) is a documented design, not built — build it only once a second human Competition Admin makes arbitrating a shared match fact a real need, not speculatively now. No elevated read visibility for either tier: pre-lock pick visibility rules apply the same to a Competition Admin as to any other player; there is no "sees everything early" bypass, and building one would be scope creep beyond what's actually decided. The very first Competition Admin account is created via a one-off seed script (same pattern as fixture seeding) alongside its competition, not a UI flow — exactly one per competition. _Deferred to future work_: a proper competition-setup flow where the first signup becomes admin automatically, a user-management screen for adding players and assigning roles, and admin-configurable competition-specific settings.
- Bot players exist (`is_bot = true`), clearly labelled on the leaderboard (e.g. 🤖). **No bot is eligible for the season "winner" title** — bots are there for fun and intrigue, and the season winner is always a person. This reverses an earlier "bots are eligible" rule; see `docs/adr/0009-match-scoring-formula-and-title-eligibility.md`, which also records the evidence behind it (in the retired World Cup app the Median Bot led most of the season and won it, and the Random Bot finished a substantial last). **Bots are per-competition** — each competition has its own bot players, scoped by `players.competition_id`; the Median Bot in particular must derive from its own competition's human picks only. Three bot types carry forward from the old app (ported logic, not reinvented); the ELO bot is dropped (see _Explicitly out of scope_):
  - **Random Bot**: predicts a random plausible scoreline for each side, independently, per match.
  - **1-1 Bot**: always predicts 1–1.
  - **Median Bot**: predicts the rounded median of that match's human players' submitted picks. Generated only _after_ the match locks (not a blind guess) — it's a "wisdom of the crowd" reference pick, not a competitive prediction. With bots now ineligible for the title, it functions as the leaderboard's **benchmark line**: beating the crowd's own consensus over a season is the one comparison in the app that says something about skill rather than luck.
- **Late joiners**: a player who signs up (via the private competition code) after gameweek 1 has begun. They **are not eligible for the season "winner" title** (didn't compete the full season). They **can submit Predict the Table at any time after joining, or skip it entirely** — both optional for them, unlike the mandatory pre-season capture for players who join before gameweek 1. Gameweeks before they joined score 0, with no special-case logic needed beyond "no picks exist for those matches" — the leaderboard's points-per-gameweek-played column (see _Scoring_) is what stops that reading as poor form rather than absence.

## Core weekly mechanic: two matches per gameweek

Each Premier League gameweek (~10 fixtures), exactly **two matches** are opened for tipping — not the full round.

**Both matches are auto-selected; no player chooses anything.** See `docs/adr/0006-auto-selected-tipped-matches.md` for the full reasoning, the rejected alternatives, and what this costs. That ADR supersedes the two rules this section previously carried (Match 1 random with marquee selection deferred; Match 2 chosen by the previous gameweek's last-placed player).

- **Match 1 — the top-ranked matchup**: the gameweek's fixture with the lowest average league position across its two clubs. Tiebreak: the matchup containing the single highest-ranked club, then a deterministic final tiebreak. Excludes any club that was in the previous gameweek's Match 1, so no club is the marquee two gameweeks running. Rank source is phased — last season's final table until every club has played ten matches of the current season, then live standings, falling back to last season's if standings are stale. A promoted club (no previous-season position) counts as position 21.
- **Match 2 — uniform random**: an equal-chance draw from the gameweek's remaining fixtures, excluding Match 1 and anything already kicked off.
- **When selection runs**: as soon as the previous gameweek's tipped matches are complete (~4–5 days' notice), on the existing sync cadence. Gameweek 1 is selected once by a seed script, since it has no previous gameweek. Chosen fixture ids are written to the `gameweeks` row and never re-rolled.
- **No anti-gaming guardrail** is built (e.g. detecting deliberate tanking) — considered and explicitly rejected as low-value engineering for a low-stakes exploit, and moot for now since nothing is player-controlled.
- **The last-place-picker mechanic is deferred, not dropped** — it remains the documented design to return to once the season is running and there's appetite for a mechanic players can steer. The `gameweeks` picker columns are retained, unused, as reserved space for it.

## Predictions

- Players tip a **full scoreline** (home score, away score) for each of the week's two open matches — not just a result or margin.
- Picks lock **5 minutes before scheduled kickoff**, recomputed automatically whenever a kickoff-time change is detected via sync.
- Before lock: a player can see their own pick; other players' and bots' picks for that match are hidden.
- After lock: all picks for that match become visible to everyone.
- **Postponement of a selected match after its picks have locked: the match is voided.** No points awarded either way, no reroll, no substitute match. This was the single point of unprompted, independent agreement across every analysis of this rebuild — treat it as settled, not open for re-litigation without a strong reason.
- **Postponement of a selected match before its picks have locked: that slot is skipped for the gameweek, not replaced.** No auto-reselection of a substitute fixture — simplest option, least code, and avoids a second wave of "new match just appeared, pick fast" pressure on players. That gameweek simply runs with one tipped match instead of two.
- Match score is the score at the end of the match including extra time, where applicable; penalty-shootout goals never count toward the tipped score (largely inherited from the old app's rules — will rarely if ever apply in normal league play, but matters for domestic cup crossover fixtures if ever included).

## Home surface — the pick board

The app's landing route `/` **is** the pick board; there is no hub or dashboard in front of it. See `docs/adr/0007-home-surface-and-pick-entry.md` for the full shape, its states, the entry mechanic, and the prototyped alternatives that were rejected.

- Every authenticated page has a persistent top-corner `?` link to `/how-it-works`. The page explains weekly picks, scoring, missing picks, Predict the Table, and winner eligibility in kid-friendly language; it is not a tab-bar destination.

- **The current gameweek is derived per request** (lowest-numbered gameweek in this season and competition with any tipped match not yet locked; else the highest-numbered gameweek that has tipped matches) — never an `is_current` column, so a missed job can't leave it wrong.
- **Two slots in fixed order**, Match 1 above Match 2, in every state, all season. Both open slots show their entry controls immediately — nothing needs opening first.
- **A settled slot** (filed, locked, live or finished) collapses to a dark plate carrying the scoreline and the player's own points. **Comparing against other players lives in the Match Centre, not here** — home shows a player their own pick and their own outcome only, which is also how the pre-lock visibility rule above is upheld by construction.
- **Nothing is pre-filled.** No provisional or suggested scoreline is stored or shown; a player who never interacts has no pick row and scores nothing.
- **Current league position is shown per club**, rendered only when standings data exists so the feature degrades to absent rather than to zeroes. Note this can disagree with the Match 1 selection rule early in the season, which ranks on last season's table — see `docs/adr/0006-auto-selected-tipped-matches.md`.
- **Day one has its own variants**: before any gameweek is scored, the stats strip drops rank and points and the season-stats block is hidden. Both revert automatically once scores exist.

## Scoring — additive

All points stack. This is the final formula — see `docs/adr/0009-match-scoring-formula-and-title-eligibility.md` for how it was arrived at, what it deliberately does **not** reward, and the alternatives rejected. That ADR supersedes the earlier version of this section (which carried an exact-scoreline bonus and a maximum of 9).

```
Correct result:                             +3
Correct goal difference:                    +2
Correct home (Team A) score  (result right) +1
Correct away (Team B) score  (result right) +1
Wrong Way Round                             +1
Maximum per match:                           7
```

- **There is no exact-scoreline bonus.** An exact scoreline scores 7 from its components alone. Exact hits are largely chance, and with only 76 scored matches in a season (2 per gameweek × 38) a jackpot term let luck outweigh a season of better judgement.
- **The two team-score points require a correct result.** A correct team score on a wrong result scores nothing.
- **Wrong Way Round** = the exact scoreline with the sides swapped (predicted 2–1, it finished 1–2): **+1**. Mutually exclusive with every other term by construction — a reversed scoreline always gets the result, the goal difference and both team scores wrong — so it can only ever pay exactly 1. It can never fire on a draw, since a reversed draw is the same scoreline.
- Reachable scores are therefore `{0, 1, 3, 4, 5, 7}`.
- No knockout-advancement bonus — there are no knockouts in a league season.

A per-match score is a **pure function of one player's pick and the match's result**. Nothing in it reads other players' picks or their relative ranking. This is what makes the idempotency rule below implementable, and what keeps a future double-points mechanic layerable as a multiplier.

**No pick, no points.** A player who never interacts has no pick row and scores nothing; missing picks are never auto-filled with a generated scoreline (see `docs/adr/0007` and ADR 0009's rejected alternatives). To stop this visually burying a Late Joiner or a player who missed a fortnight, the **leaderboard shows points-per-gameweek-played alongside the cumulative total** — a display treatment, not a scoring rule.

Scoring must be **idempotent**: correcting a previously-entered result and recomputing must never double-count. Implement as an upsert into a `scores` table keyed by `(player_id, match_id)`, recomputed from the match's current authoritative result — not as an accumulating counter.

## Season-long feature: Predict the Table

- Captured once, as part of onboarding; editable and re-submittable any number of times up until Gameweek 1's first kickoff, then locked — same lock-timing pattern as regular picks, not a single-shot submission. A Late Joiner may submit at any time after joining, or skip it entirely.
- Always **store the full 20-team ordering**. In practice only which **Table Band** a team lands in carries scoring weight (see below) — the order within a Band is incidental (whatever order the player put it in while sorting), not a meaningful player signal. This is a deliberate acceptance: "full ordering" is captured in name, but only the Band-membership portion is real signal today.
- **Capture UI**: the player fills **one Band at a time**, not one team at a time — see `docs/adr/0008-predict-the-table-group-fill-capture.md` for the full shape and the rejected alternatives, and `docs/predict-table-problem.md` for why the per-team version was replaced. All 7 Bands are on screen throughout; the open one expands with the full 20-team roster inside it, directly beneath its members, and the other six collapse to a one-line summary of who's in them. Tapping a Band header opens it — there is no rail and no permanent chevron-paging control; Band headers are the only always-present navigation. Teams show a 3-letter code, full name, and a real club-color kit-stripe for identity — no crest, per `docs/DESIGN_SYSTEM.md`'s no-crest trademark constraint. The roster is ordered by last season's finishing position, with that position shown ("Promoted" for a club new to the league), and placed teams stay in it labelled with the Band they're in. **Bands may be over- or under-filled at any time, including at submission** — tint marks only Bands needing action, an untidy table still scores (Band Bonuses are simply forfeited), and submitting warns once rather than blocking. Once all 20 are placed the accordion opens out into a full review board where a team is moved by tapping it and then tapping its new Band. No drag-and-drop reordering exists anywhere in this feature. Every move persists immediately (not just on final submit), so the flow is safely resumable. **Band-by-Band guidance**: once the open Band reaches exactly its target size, a passive "Band _n_ of 7" position readout is visible throughout filling, and a "Next: [Band] →" prompt appears at the bottom of that Band — tapping it opens the next Band ahead (in table order) that's still under its target, skipping any that are already exact or over-filled; the player can ignore it and open any Band manually instead. This is an advisory nudge, not a new navigation surface — it doesn't reach backward and never wraps.
- **Table Bands** (by final league position): Champion (1), Champions League (2–5), Europe (6–8), Mid Table (9–11), Lower Table (12–14), Relegation Battle (15–17), Relegated (18–20).
- **Scoring** — three components summing to a maximum of **200**. See `docs/adr/0010-predict-the-table-scoring.md` for the reasoning and the rejected alternatives; that ADR supersedes the earlier `6 − band_distance` / +10-per-Band version of this rule.

  ```
  Placement, per team (20 teams)
    Right Band                   5
    1 Band out                   2
    2 Bands out                  1
    3+ Bands out, or unplaced    0                              max 100

  Bold Call bonus
    +3 per correct placement made by no more than roughly one in
    10 eligible players; the best 5 count                         max  15

  Band Bonus (exact full membership, any order within)
    Champion / Champions League / Relegated          15 each
    Europe / Mid / Lower / Relegation Battle         10 each    max  85
                                                               -------
  MAXIMUM                                                          200
  ```

  `band_distance` is the number of Bands between the player's predicted Band and the team's actual Band (Bands ordered 1–7 as above). A team left unplaced scores nothing — the same as one placed 3+ Bands out. A Band whose predicted membership isn't exactly its actual membership forfeits its bonus. The three larger bonuses sit on the Bands a season is actually about; those are also the easier Bands to hit (Champion needs one team right, Mid Table needs three exact), so 15-against-10 is a bigger premium per unit of effort than it looks.

- **Bold Calls** reward being right where almost nobody else was — a placement made by no more than roughly one in 10 eligible players. A competition with fewer than 10 eligible players still allows one lone correct call; the threshold then grows by one agreement per 10 players. The rarity cohort is **frozen at Gameweek 1's lock**, so a later signup can never dilute a score already earned, and a player's own prediction counts toward its own rarity. A **Late Joiner sits outside the Bold Call process in both directions**: they earn none, and their prediction never counts toward anyone's denominator. They appear on the Predict the Table board, visually de-emphasised, and are **not eligible to win it** — which is what makes their resulting 185 ceiling a non-issue rather than a handicap.
- Bold Calls make the score a function of the whole cohort, not of one prediction alone. It stays deterministic and idempotent — fully recomputable from stored data — but note this is a **deliberate divergence** from the match-scoring rule in `docs/adr/0009` that a score is a pure function of one player's own pick. `src/lib/scoring/predict-table.ts` reflects this with two entry points: `scorePredictTable` (placement and Band Bonus, pure) and `scorePredictTableCohort` (the only one that produces a complete score).
- Ground truth for actual final Bands comes from football-data.org's `/v4/competitions/{id}/standings` endpoint (same provider as fixture/result sync) — no separate data source needed.
- This score is computed **continuously** through the season against current live standings, not revealed only at season end — a fun, low-cost engagement hook given the standings endpoint is already available.
- This score is **standalone** — it does not fold into Season Total and does not affect Season Winner. Reaffirmed alongside the match-scoring final call (`docs/adr/0009`): a realistic weekly-picking season is now ~150 points against Predict the Table's 200 maximum, so folding it in would let one pre-season submission outweigh 38 gameweeks of picking. Easy to reverse later since the full order is always captured regardless of how it's scored. Band Bonus sizing was raised at the same time, parked, and then settled in `docs/adr/0010` — see _Scoring_ above.

## Notifications

- **Email only**, via a free transactional provider (e.g. Resend). No business-verification gate, unlike WhatsApp — this is what makes full automation possible from early in the build rather than needing a manual workaround.
- **Email is optional per player** (see _Identity and auth_) — sends are best-effort to whoever has an address on file. A player with no email simply doesn't receive these; there is no in-app fallback notification for them. Accepted trade-off, not a gap to close.
- Two automated sends per gameweek, both considered high-value, neither to be cut casually:
  1. A pre-lock "picks due" reminder.
  2. A post-result "you scored X, you're now rank Y" push. This is the single highest-leverage retention lever identified during planning — the thing that turns "technically working" into "people keep opening the app." Do not deprioritize this relative to the reminder.
- Optionally capture a phone number now, at zero cost, purely so it's already on file if/when WhatsApp gets added later.
- **WhatsApp is explicitly deferred**, not attempted for initial launch. The reason: Meta business verification and template approval have an unpredictable, externally-controlled timeline that doesn't fit a fast build. Revisit only once email is proven out in practice, or sooner if email open/response rates turn out to be genuinely poor.

## Trust, fairness, and admin integrity

- No client-side Supabase access, ever (restated from _Stack_ because it's the top trust risk, not just an architecture note).
- PIN security proportionate to actual stakes: hash + attempt-lockout is sufficient. The realistic risk is shared-device shoulder-surfing among family members, not remote attack — mitigate with a clear "Switch player" flow and reasonable session handling, not by making login itself heavier.
- Session cookie: `httpOnly` + `secure` + `sameSite=Lax`. All state-changing API routes check a custom header (not present on cross-site form posts) before acting — enough CSRF protection for this threat model without a full token library, since Next.js API routes aren't naturally cross-origin-postable to begin with.
- A player who forgets their PIN has an admin-assisted reset path (see _Identity and auth_ for the forced-reset flow) — the realistic failure mode for the target age group, not a rare edge case.
- Every match-result edit gets a timestamped audit entry (who changed what, when), visible on the Match Centre — including corrections made directly by the development team, since match-editing isn't an in-app Competition Admin capability (see _Identity and auth_). This is the mitigation for the admin-is-also-a-player credibility problem; Competition Admin's season-winner eligibility no longer needs a separate carve-out for it, since they can't touch results at all.
- Prefer resolving structural fairness questions (like the postponement rule above) with the simplest, least-disputable option, even if it's not the most "correct" — for a group this size, avoiding an argument is worth more than optimizing the edge case.

## Data model (conceptual — not DDL; finalize schema during build)

- `seasons`, `teams` — global, shared across every competition; see `competitions` below.
- `competitions` — one row per private competition (currently exactly one); see `docs/adr/0004-multi-competition-foundational-scope.md` for the full reasoning. `players` and `gameweeks` carry a `competition_id`; `matches`/`teams`/`seasons` deliberately never do, since fixtures are shared, global facts.
- `gameweeks` — includes the Match-2 picker state machine (picker id, status, deadline) as DB columns, not app memory or cron-job state, so a missed cron cycle or cold start always resumes safely. Also references which fixture is Match 1 and which is Match 2 (either may be null — a Skipped Slot — if its fixture was postponed before lock).
- `matches` — includes a stable external provider id (paired with a provider name, so a future provider swap doesn't collide ids), kickoff time, status (must represent both the post-lock Voided Match and the pre-lock Skipped Slot cases distinctly — see _Predictions_), current authoritative score.
- `picks` — one row per `(player_id, match_id)`, home/away predicted score.
- `scores` — idempotent points ledger, upserted per `(player_id, match_id)` on every (re)computation.
- `table_predictions` + a full 20-team ordering per player, captured once per season.
- `players` — unique (case-insensitive, scoped per competition) `display_name` as the identity key, optional non-unique email, PIN hash, `pin_reset_required` flag (forced-reset flow), emoji (mandatory at signup, curated allowlist — see Identity and auth), `is_admin`/`is_bot` flags.
- A per-gameweek **standings snapshot**, recorded starting gameweek 1 — required to compute "who finished last" for the gameweek-2 Match-2 picker; don't skip this just because the picker UI itself might ship later than the data collection.
- `sync_log` — lightweight record of fixture/result sync attempts and outcomes, for admin visibility into the one external dependency (the football data API) that can fail silently otherwise.

## Explicitly out of scope / deferred

- **WhatsApp integration** — future add-on once email is proven out, not a launch gap to fill.
- **ELO-rating "smart" bots and the numerical optimizer behind them** — deprecated entirely from the old app. This was the only thing that ever required Python in this codebase; dropping it is what made an all-JS stack clean.
- **Full analytics/stats pages** (ELO ratings, hot streaks, progress charts) from the old app — not carried forward for relaunch. Could return later as a decoupled concern (e.g. a separate batch job) if ever rebuilt, but is not assumed or planned for now.
- **Full raw-payload event-sourcing audit log** of every provider API response — a simple `sync_log` is enough; don't over-build forensic replay tooling that isn't needed yet.
- **Anti-gaming guardrails** for the last-place-picker mechanic.
- **Admin CSV export/backup tooling** beyond a one-time database export when the old project is retired.
- **The last-place-picker mechanic itself** — deferred per `docs/adr/0006-auto-selected-tipped-matches.md`; both tipped matches are auto-selected instead. Its `gameweeks` columns are retained as reserved space.
- **Hand-picked or overridden marquee selection** — Match 1's ranking rule is a mechanical proxy for "the big game"; no human override exists.
- **Offline/retry states for pick filing, and the ambient countdown treatment** — both deferred in `docs/adr/0007-home-surface-and-pick-entry.md`, the first with a note that it constrains the route contract rather than being purely cosmetic.
- **Row-level security policies** — moot given the auth model above; enforcement lives entirely in server-side route logic instead.

## Reference

- `BUILD_PLAN.md` — initial-launch execution plan: week-by-week build order, explicit cut-if-behind list, the reasoning behind infrastructure choices (e.g. GitHub Actions vs. pg_cron for sync), and what would change any of those calls.
- `CONTEXT.md` — glossary of domain terms (Fixture, Tipped Match, Competition, Competition Admin, Season Standing, etc.).
- `docs/adr/` — architecture decision records for hard-to-reverse, non-obvious calls.
- `docs/standards/TESTING_STANDARD.md` — testing philosophy, validation order, and definition of done for this codebase.
