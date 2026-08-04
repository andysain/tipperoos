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
- Timezone for display and rules is `Australia/Sydney`; kickoffs are UK time. Store all timestamps and do all lock/deadline comparisons in UTC; render in Sydney local time only.
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
- Each player may optionally set an **emoji**, shown next to their name in the login list and leaderboard — a small kid-friendly personalization touch carried forward from the old app.
- New players self-create only with the private competition code, checked against an env var (not DB-stored — it essentially never needs to change mid-season, so admin-editability isn't worth a `settings` table).
- **Lockout**: 5 failed PIN attempts locks the account for 15 minutes (auto-expires, no admin action needed for the common case). A successful login resets the failed-attempt counter.
- **Forgot-PIN reset (admin-assisted, forced-reset flow)**: admin sets a temporary PIN (typed by the admin, communicated to the player directly — no delivery mechanism needed since it's in-person/by phone) and flags the account as needing a reset. The player logs in with the temp PIN and is forced to choose a real new PIN before reaching the app; the reset flag then clears, along with any lockout state.
- **Admin is a two-tier role, scoped per competition** (see `docs/adr/0004-multi-competition-foundational-scope.md` for the full reasoning): a **Competition Admin** (`is_admin = true`, scoped to their own competition) can still play for fun and, unlike an earlier single-tier version of this rule, **is eligible for their own competition's season "winner" title** — their one elevated capability (resetting another player's PIN, plus administering that competition's settings once any exist, e.g. a lockout duration) can't influence scoring, so the credibility conflict that would otherwise justify excluding them doesn't apply. **Match-result and kickoff-time correction is explicitly not a Competition Admin capability.** For now it's a development-team database action, not an in-app capability at all — matching the app's actual current state, since no admin route for it exists yet. A future **Superadmin** role (cross-competition match-result correction, deliberately kept off every competition's visible login list) is a documented design, not built — build it only once a second human Competition Admin makes arbitrating a shared match fact a real need, not speculatively now. No elevated read visibility for either tier: pre-lock pick visibility rules apply the same to a Competition Admin as to any other player; there is no "sees everything early" bypass, and building one would be scope creep beyond what's actually decided. The very first Competition Admin account is created via a one-off seed script (same pattern as fixture seeding) alongside its competition, not a UI flow — exactly one per competition. _Deferred to future work_: a proper competition-setup flow where the first signup becomes admin automatically, a user-management screen for adding players and assigning roles, and admin-configurable competition-specific settings.
- Bot players exist (`is_bot = true`), clearly labelled on the leaderboard (e.g. 🤖). **Bots are eligible for the season "winner" title.** Three bot types carry forward from the old app (ported logic, not reinvented); the ELO bot is dropped (see _Explicitly out of scope_):
  - **Random Bot**: predicts a random plausible scoreline for each side, independently, per match.
  - **1-1 Bot**: always predicts 1–1.
  - **Median Bot**: predicts the rounded median of that match's human players' submitted picks. Generated only _after_ the match locks (not a blind guess) — it's a "wisdom of the crowd" reference pick, not a competitive prediction.
- **Late joiners**: a player who signs up (via the private competition code) after gameweek 1 has begun. They **are not eligible for the season "winner" title** (didn't compete the full season). They **can submit Predict the Table at any time after joining, or skip it entirely** — both optional for them, unlike the mandatory pre-season capture for players who join before gameweek 1. Gameweeks before they joined score 0, with no special-case logic needed beyond "no picks exist for those matches."

## Core weekly mechanic: two matches per gameweek

Each Premier League gameweek (~10 fixtures), exactly **two matches** are opened for tipping — not the full round.

- **Match 1**: randomly auto-selected each gameweek. (Curated/marquee selection is a possible future enhancement, not v1.)
- **Match 2**: chosen by whichever player finished **last in points the previous gameweek**.
  - Tiebreak order: (1) lowest score in the previous gameweek is the primary signal; (2) if tied on that score, **worst cumulative season standing** (i.e. the tied player closest to the bottom of the table — highest rank number, not lowest); (3) if still tied, random among those tied.
  - Starts **gameweek 2** — gameweek 1 has no prior-week data, so Match 2 is also auto-randomly selected for gameweek 1 only.
  - The picker has a deadline window ("N hours after being notified"), capped so it can never overrun the earliest remaining kickoff of the gameweek. If they miss it, the system auto-picks randomly on their behalf.
  - The picked match must exclude Match 1 and any match that has already kicked off.
  - No anti-gaming guardrail is built for this (e.g. detecting deliberate tanking to control the pick) — considered and explicitly rejected as low-value engineering for a low-stakes exploit.

## Predictions

- Players tip a **full scoreline** (home score, away score) for each of the week's two open matches — not just a result or margin.
- Picks lock **5 minutes before scheduled kickoff**, recomputed automatically whenever a kickoff-time change is detected via sync.
- Before lock: a player can see their own pick; other players' and bots' picks for that match are hidden.
- After lock: all picks for that match become visible to everyone.
- **Postponement of a selected match after its picks have locked: the match is voided.** No points awarded either way, no reroll, no substitute match. This was the single point of unprompted, independent agreement across every analysis of this rebuild — treat it as settled, not open for re-litigation without a strong reason.
- **Postponement of a selected match before its picks have locked: that slot is skipped for the gameweek, not replaced.** No auto-reselection of a substitute fixture — simplest option, least code, and avoids a second wave of "new match just appeared, pick fast" pressure on players. That gameweek simply runs with one tipped match instead of two.
- Match score is the score at the end of the match including extra time, where applicable; penalty-shootout goals never count toward the tipped score (largely inherited from the old app's rules — will rarely if ever apply in normal league play, but matters for domestic cup crossover fixtures if ever included).

## Scoring — additive

All points stack (confirmed choice; the old app's actually-shipped code had drifted to a different, tiered/mutually-exclusive model — this rebuild uses the originally-documented additive one):

```
Correct result:              +3
Correct goal difference:     +2
Correct home (Team A) score: +1
Correct away (Team B) score: +1
Exact scoreline bonus:       +2
Maximum per match:           9
```

No knockout-advancement bonus — there are no knockouts in a league season.

Scoring must be **idempotent**: correcting a previously-entered result and recomputing must never double-count. Implement as an upsert into a `scores` table keyed by `(player_id, match_id)`, recomputed from the match's current authoritative result — not as an accumulating counter.

## Season-long feature: Predict the Table

- Captured once, as part of onboarding; editable and re-submittable any number of times up until Gameweek 1's first kickoff, then locked — same lock-timing pattern as regular picks, not a single-shot submission. A Late Joiner may submit at any time after joining, or skip it entirely.
- Always **store the full 20-team ordering**. In practice only which **Table Band** a team lands in carries scoring weight (see below) — the order within a Band is incidental (whatever order the player put it in while sorting), not a meaningful player signal. This is a deliberate acceptance: "full ordering" is captured in name, but only the Band-membership portion is real signal today.
- **Capture UI**: all 7 Table Bands are always visible as one board (team name + 3-letter code per team, plus a real club-color kit-stripe for identity — no crest, per `docs/DESIGN_SYSTEM.md`'s no-crest trademark constraint), each showing a dot row of how full it currently is so the whole table's progress reads at a glance. Choosing or moving a team's Band happens in a separate picker — a bottom drawer on phone-sized screens, a persistent side panel next to the board on tablet/desktop-sized screens — that auto-advances through uncalled clubs one at a time (with that club's actual previous-season finishing position shown as context, or "Promoted" for a club new to the league), or opens for a specific already-placed team when tapped, to move or swap it. Tapping a Band that's already at its target offers a direct swap with one of its current occupants instead of silently overfilling. No drag-and-drop reordering exists anywhere in this feature — deliberately avoided as the highest-risk mobile UI option for the build timeline. Every move persists immediately (not just on final submit), so the flow is safely resumable. See `docs/adr/0003-predict-the-table-shape.md` for the fuller rationale and rejected alternatives.
- **Table Bands** (by final league position): Champion (1), Champions League (2–5), Europe (6–8), Mid Table (9–11), Lower Table (12–14), Relegation Battle (15–17), Relegated (18–20).
- **Scoring**, per team: `(7 − band_distance) − 1`, range 0–6, where `band_distance` is the number of Bands between the player's predicted Band and the team's actual Band (Bands ordered 1–7 as above; a team can never score below 0, since the maximum possible band_distance is exactly 6). Plus a **Band Bonus** of +10 for exactly matching a Band's full team membership (any order within it), except the Champion Band, whose bonus is +20 (a single-team Band, the flagship pick). Maximum possible score: **200** (20 teams × 6, + 6 Bands × 10, + 20 for Champion).
- Ground truth for actual final Bands comes from football-data.org's `/v4/competitions/{id}/standings` endpoint (same provider as fixture/result sync) — no separate data source needed.
- This score is computed **continuously** through the season against current live standings, not revealed only at season end — a fun, low-cost engagement hook given the standings endpoint is already available.
- This score is **standalone** — it does not fold into Season Total and does not affect Season Winner. Deliberately left this way for now; easy to reverse later since the full order is always captured regardless of how it's scored.

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
- `players` — unique (case-insensitive, scoped per competition) `display_name` as the identity key, optional non-unique email, PIN hash, `pin_reset_required` flag (forced-reset flow), optional emoji, `is_admin`/`is_bot` flags.
- A per-gameweek **standings snapshot**, recorded starting gameweek 1 — required to compute "who finished last" for the gameweek-2 Match-2 picker; don't skip this just because the picker UI itself might ship later than the data collection.
- `sync_log` — lightweight record of fixture/result sync attempts and outcomes, for admin visibility into the one external dependency (the football data API) that can fail silently otherwise.

## Explicitly out of scope / deferred

- **WhatsApp integration** — future add-on once email is proven out, not a launch gap to fill.
- **ELO-rating "smart" bots and the numerical optimizer behind them** — deprecated entirely from the old app. This was the only thing that ever required Python in this codebase; dropping it is what made an all-JS stack clean.
- **Full analytics/stats pages** (ELO ratings, hot streaks, progress charts) from the old app — not carried forward for relaunch. Could return later as a decoupled concern (e.g. a separate batch job) if ever rebuilt, but is not assumed or planned for now.
- **Full raw-payload event-sourcing audit log** of every provider API response — a simple `sync_log` is enough; don't over-build forensic replay tooling that isn't needed yet.
- **Anti-gaming guardrails** for the last-place-picker mechanic.
- **Admin CSV export/backup tooling** beyond a one-time database export when the old project is retired.
- **Curated/marquee Match-1 selection** — random selection only, for now.
- **Row-level security policies** — moot given the auth model above; enforcement lives entirely in server-side route logic instead.

## Reference

- `BUILD_PLAN.md` — initial-launch execution plan: week-by-week build order, explicit cut-if-behind list, the reasoning behind infrastructure choices (e.g. GitHub Actions vs. pg_cron for sync), and what would change any of those calls.
- `CONTEXT.md` — glossary of domain terms (Fixture, Tipped Match, Competition, Competition Admin, Season Standing, etc.).
- `docs/adr/` — architecture decision records for hard-to-reverse, non-obvious calls.
- `docs/standards/TESTING_STANDARD.md` — testing philosophy, validation order, and definition of done for this codebase.
