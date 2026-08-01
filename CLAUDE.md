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

- **Next.js on Vercel**, full JS. No Python in the live app — this was a deliberate call, not an oversight; see *Explicitly out of scope* for what that ruled out.
- **Supabase Postgres** (fresh project, not the old World Cup project) as the backend, plus a **second free Supabase project as a staging environment** for the week-3 dry run and general testing, so testing never runs against the same project going live for real players. Free tier allows 2 active projects per org.
- **Ongoing backup**: a lightweight weekly export of the live project's tables (same REST-export pattern used for the old project's one-time backup), so the new project has a rolling data safety net during the season, not just a pre-launch one-off.
- **Three-environment mapping**, all free on Vercel's Hobby tier:
  | Environment | Where it runs | Supabase project |
  |---|---|---|
  | Local dev | `next dev` on your machine | staging (`.env.local`, gitignored) |
  | Preview | Vercel auto-deploys every branch push/PR to a unique URL | staging (Vercel env vars scoped to "Preview") |
  | Production | Vercel deploys `main` to the real domain | production (Vercel env vars scoped to "Production") |

  Discipline this requires: apply any schema migration to staging first, confirm it, then apply the same migration to production before merging the branch that depends on it — schema drift between the two is the main failure mode.
- **Auth is not Supabase Auth.** Login is application-level (email + PIN, see below), so Postgres RLS cannot key off `auth.uid()`. Consequence: **all reads and writes must go through server-side Next.js API routes** — never a direct client-side Supabase call, anywhere, ever. This is the single biggest security invariant in the app; violating it is how a technically-minded player reads other players' pre-lock picks via devtools.
- **Fixture/result sync**: a GitHub Actions scheduled workflow is the primary mechanism (~10–15 min cadence on match days) calling a Vercel API route, which calls a free football data API (e.g. football-data.org — confirmed free tier includes the Premier League, at 10 calls/minute). All 380 season fixtures are seeded once from published data; the API is used only for deltas — kickoff-time changes and results — never to discover fixtures. Each sync cycle must be **one batched date-range call**, not one call per fixture, to stay comfortably inside the free-tier rate limit. Match on a stable external fixture ID, never team-name+date.
- A lightweight Supabase pg_cron job runs as a secondary **health-check watchdog only** (not the sync itself): confirms a successful sync happened recently and alerts the admin if not.
- **Email, not WhatsApp**, is the notification channel (see *Notifications*). WhatsApp is a deferred future add-on.

## Identity and auth

- **Display name + PIN.** `display_name` is the required, unique (case-insensitive) identity key and login selector — reverted to this from an email-based identity model earlier in planning (see `docs/adr/0002-email-optional-display-name-identity.md`). PIN is a fixed 4 digits, hashed with Node's built-in `crypto.scrypt` (no new dependency). This is not a bank; don't add heavier auth than that.
- **Email is optional and not unique.** Not every player has their own address; siblings may share a parent's. It exists purely as an optional notification-delivery field — never used for login or as an identity key. Consequence: not every player will receive the pre-lock reminder or post-result score/rank emails; accepted trade-off.
- Login UX is unchanged from the old app's spirit: pick your display name from a list, enter your PIN. No per-login email round-trip (ruled out OTP/magic-link login specifically because it reintroduces friction on a shared family device, and email isn't reliably on file for every player anyway now).
- **Session**: a stateless signed cookie (player id + HMAC signature via a server-side secret) — no DB sessions table, no expiry. Persists until the player explicitly uses "Switch player." Sufficient for the shared-device threat model; a revocable server-side session table would be solving a problem that doesn't exist here.
- Each player may optionally set an **emoji**, shown next to their name in the login list and leaderboard — a small kid-friendly personalization touch carried forward from the old app.
- New players self-create only with the private competition code, checked against an env var (not DB-stored — it essentially never needs to change mid-season, so admin-editability isn't worth a `settings` table).
- **Lockout**: 5 failed PIN attempts locks the account for 15 minutes (auto-expires, no admin action needed for the common case). A successful login resets the failed-attempt counter.
- **Forgot-PIN reset (admin-assisted, forced-reset flow)**: admin sets a temporary PIN (typed by the admin, communicated to the player directly — no delivery mechanism needed since it's in-person/by phone) and flags the account as needing a reset. The player logs in with the temp PIN and is forced to choose a real new PIN before reaching the app; the reset flag then clears, along with any lockout state.
- One player flag is `is_admin`; admin can still play for fun but is **explicitly ineligible for the season "winner" title**, to avoid a credibility problem when the admin is also the one entering/correcting results. **Admin has exactly two elevated capabilities — entering/correcting match results and kickoff times, and resetting another player's PIN — and no elevated read visibility.** They see the app exactly as any other player would (pre-lock pick visibility rules apply to them too); there is no "admin sees everything early" bypass, and building one would be scope creep beyond what's actually decided. The very first admin account is created via a one-off seed script (same pattern as fixture seeding), not a UI flow — there's only ever one admin for now. *Deferred to future work*: a proper competition-setup flow where the first signup becomes admin automatically, a user-management screen for adding players and assigning roles, and admin-configurable competition-specific settings.
- Bot players exist (`is_bot = true`), clearly labelled on the leaderboard (e.g. 🤖). **Bots are eligible for the season "winner" title** — only the admin is excluded, per above. Three bot types carry forward from the old app (ported logic, not reinvented); the ELO bot is dropped (see *Explicitly out of scope*):
  - **Random Bot**: predicts a random plausible scoreline for each side, independently, per match.
  - **1-1 Bot**: always predicts 1–1.
  - **Median Bot**: predicts the rounded median of that match's human players' submitted picks. Generated only *after* the match locks (not a blind guess) — it's a "wisdom of the crowd" reference pick, not a competitive prediction.
- **Late joiners**: a player who signs up (via the private competition code) after gameweek 1 has begun. They **are not eligible for the season "winner" title** (didn't compete the full season — same exclusion mechanism as the admin). They **can submit Predict the Table at any time after joining, or skip it entirely** — both optional for them, unlike the mandatory pre-season capture for players who join before gameweek 1. Gameweeks before they joined score 0, with no special-case logic needed beyond "no picks exist for those matches."

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

- Captured once, as part of onboarding, before the season meaningfully progresses.
- Always **store the full 20-team ordering**, regardless of what actually gets scored — any simplified scoring view (e.g. champion, top 4, relegation) can derive from a full ranking later; a simplified capture can never be un-simplified into a full one.
- The exact scoring/UI shape (full 1–20 ranking vs. a simplified champion/top-4/relegation pick) is **deliberately deferred** — decide it when this feature is actually being built, not before. Consider that a full 20-item drag-reorder is a meaningfully harder mobile UI to get right than a handful of dropdowns, given the kid-friendly/mobile-first constraints above.

## Notifications

- **Email only**, via a free transactional provider (e.g. Resend). No business-verification gate, unlike WhatsApp — this is what makes full automation possible from early in the build rather than needing a manual workaround.
- **Email is optional per player** (see *Identity and auth*) — sends are best-effort to whoever has an address on file. A player with no email simply doesn't receive these; there is no in-app fallback notification for them. Accepted trade-off, not a gap to close.
- Two automated sends per gameweek, both considered high-value, neither to be cut casually:
  1. A pre-lock "picks due" reminder.
  2. A post-result "you scored X, you're now rank Y" push. This is the single highest-leverage retention lever identified during planning — the thing that turns "technically working" into "people keep opening the app." Do not deprioritize this relative to the reminder.
- Optionally capture a phone number now, at zero cost, purely so it's already on file if/when WhatsApp gets added later.
- **WhatsApp is explicitly deferred**, not attempted for initial launch. The reason: Meta business verification and template approval have an unpredictable, externally-controlled timeline that doesn't fit a fast build. Revisit only once email is proven out in practice, or sooner if email open/response rates turn out to be genuinely poor.

## Trust, fairness, and admin integrity

- No client-side Supabase access, ever (restated from *Stack* because it's the top trust risk, not just an architecture note).
- PIN security proportionate to actual stakes: hash + attempt-lockout is sufficient. The realistic risk is shared-device shoulder-surfing among family members, not remote attack — mitigate with a clear "Switch player" flow and reasonable session handling, not by making login itself heavier.
- Session cookie: `httpOnly` + `secure` + `sameSite=Lax`. All state-changing API routes check a custom header (not present on cross-site form posts) before acting — enough CSRF protection for this threat model without a full token library, since Next.js API routes aren't naturally cross-origin-postable to begin with.
- A player who forgets their PIN has an admin-assisted reset path (see *Identity and auth* for the forced-reset flow) — the realistic failure mode for the target age group, not a rare edge case.
- Every match-result edit (admin corrections included) gets a timestamped audit entry (who changed what, when), visible on the Match Centre — this is the mitigation for the admin-is-also-a-player credibility problem, alongside the admin's season-winner ineligibility above.
- Prefer resolving structural fairness questions (like the postponement rule above) with the simplest, least-disputable option, even if it's not the most "correct" — for a group this size, avoiding an argument is worth more than optimizing the edge case.

## Data model (conceptual — not DDL; finalize schema during build)

- `seasons`, `teams`
- `gameweeks` — includes the Match-2 picker state machine (picker id, status, deadline) as DB columns, not app memory or cron-job state, so a missed cron cycle or cold start always resumes safely. Also references which fixture is Match 1 and which is Match 2 (either may be null — a Skipped Slot — if its fixture was postponed before lock).
- `matches` — includes a stable external provider id (paired with a provider name, so a future provider swap doesn't collide ids), kickoff time, status (must represent both the post-lock Voided Match and the pre-lock Skipped Slot cases distinctly — see *Predictions*), current authoritative score.
- `picks` — one row per `(player_id, match_id)`, home/away predicted score.
- `scores` — idempotent points ledger, upserted per `(player_id, match_id)` on every (re)computation.
- `table_predictions` + a full 20-team ordering per player, captured once per season.
- `players` — unique (case-insensitive) `display_name` as the identity key, optional non-unique email, PIN hash, `pin_reset_required` flag (forced-reset flow), optional emoji, `is_admin`/`is_bot` flags.
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
- `CONTEXT.md` — glossary of domain terms (Fixture, Tipped Match, Admin, Season Standing, etc.).
- `docs/adr/` — architecture decision records for hard-to-reverse, non-obvious calls.
- `docs/standards/TESTING_STANDARD.md` — testing philosophy, validation order, and definition of done for this codebase.

