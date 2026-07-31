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
- **Supabase Postgres** (fresh project, not the old World Cup project) as the backend.
- **Auth is not Supabase Auth.** Login is application-level (email + PIN, see below), so Postgres RLS cannot key off `auth.uid()`. Consequence: **all reads and writes must go through server-side Next.js API routes** — never a direct client-side Supabase call, anywhere, ever. This is the single biggest security invariant in the app; violating it is how a technically-minded player reads other players' pre-lock picks via devtools.
- **Fixture/result sync**: a GitHub Actions scheduled workflow is the primary mechanism (~10–15 min cadence on match days) calling a Vercel API route, which calls a free football data API (e.g. football-data.org). All 380 season fixtures are seeded once from published data; the API is used only for deltas — kickoff-time changes and results — never to discover fixtures. Match on a stable external fixture ID, never team-name+date.
- A lightweight Supabase pg_cron job runs as a secondary **health-check watchdog only** (not the sync itself): confirms a successful sync happened recently and alerts the admin if not.
- **Email, not WhatsApp**, is the notification channel (see *Notifications*). WhatsApp is a deferred future add-on.

## Identity and auth

- **Email + PIN.** Email is a required, unique field per player (not optional) — this is what makes email notifications reliable; younger players can use a parent's address. PIN is short (4–6 digit), hashed, with a max-5-attempt lockout. This is not a bank; don't add heavier auth than that.
- Login UX is unchanged from the old app's spirit: pick your display name from a list, enter your PIN. No per-login email round-trip (ruled out OTP/magic-link login specifically because it reintroduces friction on a shared family device).
- New players self-create only with the private competition code, matching the old model.
- One player flag is `is_admin`; admin can still play for fun but is **explicitly ineligible for the season "winner" title**, to avoid a credibility problem when the admin is also the one entering/correcting results.
- Bot players exist (`is_bot = true`), clearly labelled on the leaderboard (e.g. 🤖). Bot mechanics (which bot types, how they generate picks) are not yet fully re-specified for this rebuild — treat as an open design item, not carried over verbatim from the old app.

## Core weekly mechanic: two matches per gameweek

Each Premier League gameweek (~10 fixtures), exactly **two matches** are opened for tipping — not the full round.

- **Match 1**: randomly auto-selected each gameweek. (Curated/marquee selection is a possible future enhancement, not v1.)
- **Match 2**: chosen by whichever player finished **last in points the previous gameweek**.
  - Tiebreak order: (1) lowest score in the previous gameweek is the primary signal; (2) if tied on that score, lowest cumulative season standings position; (3) if still tied, random among those tied.
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
- Two automated sends per gameweek, both considered high-value, neither to be cut casually:
  1. A pre-lock "picks due" reminder.
  2. A post-result "you scored X, you're now rank Y" push. This is the single highest-leverage retention lever identified during planning — the thing that turns "technically working" into "people keep opening the app." Do not deprioritize this relative to the reminder.
- Optionally capture a phone number now, at zero cost, purely so it's already on file if/when WhatsApp gets added later.
- **WhatsApp is explicitly deferred**, not attempted for initial launch. The reason: Meta business verification and template approval have an unpredictable, externally-controlled timeline that doesn't fit a fast build. Revisit only once email is proven out in practice, or sooner if email open/response rates turn out to be genuinely poor.

## Trust, fairness, and admin integrity

- No client-side Supabase access, ever (restated from *Stack* because it's the top trust risk, not just an architecture note).
- PIN security proportionate to actual stakes: hash + attempt-lockout is sufficient. The realistic risk is shared-device shoulder-surfing among family members, not remote attack — mitigate with a clear "Switch player" flow and reasonable session handling, not by making login itself heavier.
- Every match-result edit (admin corrections included) gets a timestamped audit entry (who changed what, when), visible on the Match Centre — this is the mitigation for the admin-is-also-a-player credibility problem, alongside the admin's season-winner ineligibility above.
- Prefer resolving structural fairness questions (like the postponement rule above) with the simplest, least-disputable option, even if it's not the most "correct" — for a group this size, avoiding an argument is worth more than optimizing the edge case.

## Data model (conceptual — not DDL; finalize schema during build)

- `seasons`, `teams`
- `gameweeks` — includes the Match-2 picker state machine (picker id, status, deadline) as DB columns, not app memory or cron-job state, so a missed cron cycle or cold start always resumes safely.
- `matches` — includes a stable external provider id (paired with a provider name, so a future provider swap doesn't collide ids), kickoff time, status, current authoritative score.
- `picks` — one row per `(player_id, match_id)`, home/away predicted score.
- `scores` — idempotent points ledger, upserted per `(player_id, match_id)` on every (re)computation.
- `table_predictions` + a full 20-team ordering per player, captured once per season.
- `players` — includes required unique email, PIN hash, `is_admin`, `is_bot` flags.
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

