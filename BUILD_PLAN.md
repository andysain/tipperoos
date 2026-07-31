# Tipperoos EPL Rebuild — Build Plan

Produced via a 4-agent fan-out / cross-examine / adjudicate process (Ship-it, Data model & scoring, Operations, Red team) against the agreed draft spec. This document is the adjudicated decision record — the orchestrator's picks, not an average of the four inputs. No application code was written this session.

Season opens **Friday 2026-08-21**.

> **Amendment (post-adjudication, 2026-08-01):** after this plan was adjudicated, you decided to drop phone/WhatsApp entirely in favor of **email + PIN** as the identity/notification model — the four-agent process below argued about how to de-risk WhatsApp, not whether to replace it, so this is a direct decision layered on top, not a re-litigated agent conclusion. All affected sections below have been updated accordingly; WhatsApp is now a deferred future enhancement, not part of the launch build at all.

---

## Decisions made (gaps 1–12, plus new ones found)

1. **Three-week timeline** — phased build, see Build Plan below. Treated as a hard external constraint, not negotiable scope.
2. **Cron/sync mechanism** — **GitHub Actions scheduled workflow is primary** (fixture/result delta sync, ~10–15 min cadence on match days), with a **lightweight Supabase pg_cron health-check as a secondary watchdog** (checks "was a successful sync recorded recently," alerts admin if not — does not run the sync itself). Reasoning: a solo hobbyist under a 3-week deadline needs a primary mechanism they can debug at 11pm with `gh run list`; pg_cron's reliability edge doesn't offset that its operator (both agents proposing it, and me) has no track record running it at this cadence for a full season. See *Rejected*.
3. **Notifications: email, not WhatsApp** *(superseded post-adjudication)*. Login moves to **email + PIN**: same fast dropdown-name + PIN login UX as before (no change for players, no email-checking friction on a shared device), but **email becomes a required identity field** instead of an optional phone number — younger players can use a parent's address. This removes the entire Meta/Twilio business-verification track from the plan (previously the single largest external-dependency risk) and lets both the pre-lock reminder and the post-result push be fully automated from week 1 via a free transactional email provider (e.g. Resend, ~3,000 free emails/month, no business verification gate). WhatsApp is not being attempted for launch at all — it's a clean future add-on, not a fallback path to maintain. Optionally capture phone number too, at zero cost, purely so it's already on file if WhatsApp gets added later.
4. **Fixture seeding** — all 380 fixtures seeded once from published data. The API is only ever queried for kickoff-time changes and results, never to discover fixtures. This is the single biggest risk-reducer in the whole plan — universal agreement across all four agents.
5. **What players tip** — scorelines (confirmed, matches old app). Schema and scoring engine are built around a `pred_home_score`/`pred_away_score` pair per pick, not just result or margin.
6. **Lock and visibility** — picks lock 5 minutes before *scheduled* kickoff (recomputed whenever a kickoff-time change is detected via sync), enforced server-side against DB time, never client clock or a disabled button. Other players' picks for a match are hidden until that match locks.
7. **Postponement after lock** — **void, no reroll, no substitute.** Three agents (data model, ops, red team) converged on this independently without seeing each other's work — the strongest signal of any decision in this document. No points either side; least disputable option, avoids "which replacement match" arguments entirely.
8. **Timezone** — UTC storage and all deadline/lock comparisons; Sydney (`Australia/Sydney`) for display only. No exceptions.
9. **Old World Cup data** — full `pg_dump` (or CSV export) of the current Supabase project, done **before** any schema changes, day 1 of week 1. A git tag preserves code, not data — both are needed. *(Not performed this session — you explicitly held off on this earlier; it's now the first item in Week 1.)*
10. **PIN auth / server-side routing** — hashed PIN, max-5-attempt lockout, nothing heavier (this is not a bank). Identity key is now **email address** (required, unique per player) rather than username, per decision 3 above; login itself is unchanged — pick your display name from a dropdown, enter your PIN. Because login isn't `auth.uid()`-based, Supabase RLS cannot gate rows — **all reads and writes must route through server-side Next.js API routes**, never a direct client→Supabase call. Universal agreement, zero dissent across all four agents; this is a correctness requirement, not a preference.
11. **Match-2 picker edge cases** *(timing set by you, post-adjudication)* — state lives in DB columns on `gameweeks` (picker id, status, deadline), not app memory or cron state, so a missed cron cycle or cold start resumes safely. GW1 auto-randomizes Match 2 (no prior data exists yet); the real "last-place picks" mechanic switches on starting **gameweek 2**, using gameweek 1's score as the signal. Tiebreak order: (1) lowest score in the previous gameweek, (2) lowest cumulative standings position, (3) random among any still tied. Deadline window is "N hours after notification," capped so it can never overrun the earliest remaining kickoff. **Schedule consequence**: this needs to be built and tested by launch week, not eased in later — see Week 3 and Cut-if-behind below.
12. **Predict-the-table storage** — store the full 20-team ordering regardless of what gets scored (cheap, and any simplified scoring view derives from it, not the reverse). Exact scoring/UI shape (full ranking vs. simplified champion/top-4/relegation) is **deliberately deferred** — your call — to be decided when this feature is actually being built (Week 3), not now.

**New gaps found (folded into decisions above or here):**

- **Scoring formula divergence** *(found by data-model agent, confirmed by me reading `src/tipperoos/core/scoring.py` directly)*: CLAUDE.md documents additive stacking scoring (3+2+1+1+5); the actual shipped code is tiered and mutually exclusive (Exact=5 / Goal-diff=4 / Result=3 / Wrong=0, plus +1 knockout advancement which doesn't apply to a league). **Resolved: additive**, per your call — result (3) + goal difference (2) + correct Team A score (1) + correct Team B score (1) + exact-score bonus (5), all stacking, max 12 per match. No knockout-advancement term, since there are no knockouts in a league season.
- **No health/alerting layer** *(ops agent)*: resolved via the pg_cron watchdog in decision 2.
- **Admin-as-player credibility risk** *(red-team agent)*: admin is also a competing player, which is a real dispute risk on any close scoring correction. Resolved: every match-result edit gets a timestamped `updated_by`/`updated_at` audit trail visible on the Match Centre, and the admin is explicitly flagged as **ineligible for the season "winner" title** even though they can still play for fun.
- **Match-2 deferral bootstrapping gap** *(data-model agent, found in cross-examination)*: if the real picker mechanic is deferred to gameweek 4, it needs "who finished last" history that only exists if it was being recorded since gameweek 1. Resolved: a lightweight per-gameweek standings snapshot is recorded from GW1 onward regardless of whether the picker UI itself is live.
- **football-data.org freshness SLA is undocumented for live matches** *(ship-it agent)*: mitigated by scope, not engineering — the app never needs live in-match data, only pre-match kickoff-time changes and final full-time results, which is a much smaller exposure window. Verify actual latency empirically in week 2 before trusting it for anything lock-adjacent.

---

## Build plan

### Week 1 — Aug 1–7: Foundation (load-bearing week)

- **Day 1**: `pg_dump`/CSV export of the current Supabase project. Tag current repo state (`worldcup-2026-final`). Sign up for a free transactional email provider (e.g. Resend) — a five-minute task, no verification queue to wait on.
- Fresh Supabase project; schema v1: `seasons`, `teams`, `gameweeks` (with match-2 state-machine columns), `matches`, `picks`, `scores`, `table_predictions` + `table_prediction_ranks`, `sync_log`, players/auth.
- Seed all 380 fixtures + teams, one-time import.
- Next.js app skeleton on Vercel.
- Auth: email + PIN, hashed, server-side session, rate-limit/lockout. Email required and unique per player (parents can use their own for younger kids); display-name dropdown + PIN login UX unchanged. **All DB access goes through server-side API routes** — no client-side Supabase calls, anywhere, ever.
- Basic picks UI: scoreline entry for the week's 2 matches (both auto-random-selected for now), 5-minute server-side lock.

### Week 2 — Aug 8–14: Sync, scoring, leaderboard

- GitHub Actions scheduled workflow (primary sync) → Vercel API route → football-data.org, matching on stable external fixture ID (never team+date). On failure: log to `sync_log`, leave existing data untouched, retry next cycle, never block page rendering.
- Supabase pg_cron health-check watchdog: verifies a successful sync happened recently, alerts admin if not.
- Scoring engine: pure function, idempotent via upsert into `scores` keyed by `(player_id, match_id)`, recomputed whenever a result is finalized or corrected. Built so the tiered-vs-additive question (see *Unresolved*) is a one-function swap, not a schema change.
- Leaderboard (sum of `scores`).
- Admin manual override UI for results/kickoff times — doubles as the full offline fallback if the API dies outright.
- Per-gameweek standings snapshot recorded from GW1 (bootstrapping fix for the week-4 picker).
- Automated email sends: a pre-lock "picks due" reminder and a post-result "you scored X, now rank Y" push, both triggered off the same GitHub Actions schedule already syncing results. This is the red-team agent's highest-leverage retention lever, now shippable in full from week 2 instead of needing a manual interim workaround.
- Run the scripted gameweek-simulation test (pick → lock → result → score → corrected result → rescore, assert totals don't drift) before trusting the pipeline against any real match.

### Week 3 — Aug 15–21: Automation, polish, dry run

- Automate Match 1 random selection per gameweek.
- **Match-2 real picker mechanic**: build and test now — it goes live gameweek 2, not gameweek 4, so there is no runway to ease into it post-launch. Uses the GW1 standings snapshot (already being recorded from Week 2) to compute lowest score → lowest cumulative position → random-among-ties.
- Predict-the-table: ship a basic version, finalizing the exact shape (deferred decision, see above) now that it's actually being built (using the full-20-team-ordering schema) as part of onboarding, must be captured before GW1 kickoff since it's a one-time entry.
- Admin result-edit audit trail + admin-ineligible-for-season-win flag.
- Confirm postponement handling (void, no reroll) is wired into both the sync path and the admin manual-override path.
- Full end-to-end dry run: simulate a complete gameweek cycle with synthetic data before Friday, including the two email sends.

### Cut-if-behind list

- Predict-the-table UI — can slip a few days into GW1 if genuinely squeezed; it only needs to lock before the season meaningfully progresses, not before day one, for a friendly comp of this size.
- WhatsApp entirely — not attempted for launch; a genuine future add-on once email is proven out, not a gap to fill.
- Full raw-payload event-sourcing audit log (`match_result_events`) — deferred to post-launch; `sync_log` is sufficient for v1.
- Real Match-2 picker mechanic — genuinely tight now that it targets gameweek 2, not gameweek 4. The actual fallback lever if week 3 runs long: keep Match 2 auto-random for gameweek 2 as well (same as GW1) and slip the real picker to gameweek 3 — one extra week of runway, not the three-gameweek buffer this plan originally had.
- Admin CSV export/backup tooling beyond the one-time `pg_dump` — deferred.
- Two-strikes anti-gaming guardrail for the picker — not building this at all (see *Rejected*).

---

## Rejected

- **Overruled the operations agent's "pg_cron + Edge Function as primary sync."** Kept GitHub Actions as primary, demoted pg_cron to a secondary health-check role. The ops agent itself admitted no personal track record running pg_cron/pg_net/Edge Functions at this cadence for a full season — that's a real risk for a solo builder on a 3-week deadline, and GitHub's visible run history is exactly the kind of surface a non-technical admin can glance at, which the red-team agent flagged as missing from the pg_cron-only design.
- **Overruled the data-model agent's full versioned `match_result_events` audit-log design for v1.** Kept the idempotent `scores` upsert-by-match table (non-negotiable — cheap, and prevents double-counting on corrections, which is exactly the "expensive to fix once live" mistake that agent's mandate exists to prevent) but cut the raw-payload event-sourcing table down to a simple `sync_log` for launch. The incremental schema/testing surface of full event-sourcing isn't justified in three weeks when the simpler design gives the same guarantees.
- **Overruled the red-team agent's two-strikes anti-gaming guardrail** for the last-place picker. That agent itself flagged low confidence — the fix can't distinguish deliberate tanking from a genuine losing streak, and the actual gaming incentive is low-stakes (no points edge, "just social/troll value" by its own assessment). Not worth building speculative anti-cheat for a problem that may never materialize in a 10–20-person friendly comp.
- **Partially overruled the ship-it agent's full WhatsApp cut** *(later superseded by your decision)*. At adjudication time, agreed with cutting automated Twilio integration from the critical path but disagreed with cutting all player notification through gameweek 3, per the red-team agent's retention argument — resolved via a manual WhatsApp-copy-paste workaround. That workaround is now moot: switching the notification channel to email (your call, above) delivers the same retention benefit the red-team agent argued for, fully automated, without ever needing WhatsApp or the workaround at all.

---

## Unresolved — decisions for you

All three items originally listed here have been resolved by you:

- **Scoring formula** → additive (see Decisions made, scoring-divergence entry).
- **Match-2 picker launch timing** → gameweek 2, lowest-score → lowest-position → random tiebreak (see decision 11).
- **Predict-the-table shape** → not resolved, but explicitly and deliberately deferred to Week 3, when the feature is actually being built — this is a decision (defer), not an open gap.

Nothing outstanding needs your input right now. The one thing worth flagging back to you: gameweek-2 picker timing trades away the three-gameweek buffer this plan originally banked — see the Week 3 and Cut-if-behind updates above.

---

## Confidence and triggers — what would change my mind

1. **Cron mechanism (GitHub Actions primary + pg_cron watchdog):** if GitHub Actions scheduled-workflow runs turn out to be flakier in practice than the "5–30 min delay, occasional drop" norm the ops agent cited — i.e. you see it skip runs repeatedly during week-1/2 testing — I'd flip pg_cron to primary despite the unfamiliarity cost. Reliability would then dominate the debuggability argument.
2. **Email as the sole notification channel:** if email open/response rates turn out to be poor in practice once real players are using it (spam-foldered, ignored, parents' inboxes not checked promptly), I'd revisit WhatsApp sooner than "a future enhancement" — but I'd want a week or two of real usage data before concluding that, not a guess up front.
3. **Simplified scores ledger (upsert table, not full event-sourcing):** if week-2 testing shows football-data.org has real freshness or accuracy problems (the ship-it agent's self-flagged unverified concern), I'd reconsider pulling the fuller `match_result_events` audit log forward rather than deferring it — forensic replay becomes actually necessary rather than nice-to-have the moment the data source itself is untrustworthy.
