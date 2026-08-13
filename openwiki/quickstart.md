---
type: concept
title: Tipperoos Wiki Quickstart
description: Entry point for the Tipperoos code wiki — architecture overview, navigation guide, and task-routing table for agents and developers.
tags: [quickstart, entrypoint, navigation]
---

# Tipperoos Wiki Quickstart

Tipperoos is a private Premier League tipping competition — a mobile-friendly Next.js app deployed on Vercel with Supabase Postgres. This wiki documents every subsystem, data flow, and change surface.

## Wiki map

### Architecture

- [Architecture Overview](architecture/overview.md) — Stack, environments, deployment, key patterns
- [Security Model](architecture/security-model.md) — Auth, CSRF, server-only access, competition scoping
- [Bot Players](architecture/bot-players.md) — Three bot types, eligibility, Median Bot as benchmark
- [Result Lifecycle](architecture/result-lifecycle.md) — Standings sync → data flow (current state and deferred work)

### Authentication

- [Session Management](auth/session.md) — Stateless HMAC-signed cookie
- [Login Flow](auth/login-flow.md) — Competition code gate, display name list, PIN entry, lockout
- [Signup](auth/signup.md) — Self-creation with code, display name validation, emoji picker
- [PIN Security](auth/pin-security.md) — Scrypt hashing, 5-attempt lockout, optimistic concurrency
- [Competition Codes](auth/competition-codes.md) — Collision detection, per-environment codes
- [Emoji System](auth/emoji-system.md) — Curated kid-appropriate library, client/server sharing

### Competitions

- [Scope Model](competitions/scope-model.md) — Multi-competition data isolation, join-back pattern
- [Bootstrap](competitions/bootstrap.md) — Atomic creation via Postgres RPC function

### Match Selection & Gameweeks

- [Match Selection Rules](match-selection/rules.md) — Match 1 (top matchup), Match 2 (random), rank source phasing
- [Voided Matches](match-selection/voided-matches.md) — Skipped vs. voided lifecycle
- [Gameweek Resolution](gameweeks/resolution.md) — Derived current-gameweek algorithm (no `is_current` flag)

### Pick Board

- [Pick Board Overview](pick-board/overview.md) — Home page layout, data loading, security invariants, sub-components (StatsStrip, LastWeekStrip, GameweekHeader, PickBoardSlotCard, SeasonStatsBlock)
- [Tipped Match Card](pick-board/tipped-match-card.md) — 5-state card component, entry/filed/locked/live/finished

### Table Predictions

- [Capture Rules](table-predictions/capture-rules.md) — 7 bands, late joiner rules, editability
- [Board Logic](table-predictions/board-logic.md) — Filling vs review phase state machine, tap grammars
- [React Flow](table-predictions/react-flow.md) — PredictTableFlow, BandsBoard, optimistic persistence, SubmittedMoment
- [API Routes](table-predictions/api-routes.md) — assign/unassign/submit/skip, concurrency handling
- [Data Access](table-predictions/data-access.md) — DB-fetching glue shared by all routes

### Scoring

- [Match Scoring](scoring/match-scoring.md) — 7-point additive formula, Wrong Way Round
- [Predict Table Scoring](scoring/predict-table-scoring.md) — Placement + Band Bonus + Bold Call (max 200)

### Standings Sync

- [Sync Overview](standings-sync/overview.md) — football-data.org standings sync, sync_log audit trail
- [GitHub Actions](standings-sync/github-actions.md) — CI workflow, OpenWiki update workflow

### Design System

- [Design Tokens](design-system/tokens.md) — Tailwind v4 theme, colour tokens, radii, animations
- [Kit Colors](design-system/kit-colors.md) — Club colour mapping, clash rule, contrast floor
- [Components](design-system/components.md) — Button, Card, CardShell, ClubCodeBadge, PinInput, TextField

### Navigation & UX

- [App Shell](navigation/app-shell.md) — Root layout, TabBar, SwitchPlayerButton, HelpButton
- [Timezone Handling](navigation/timezone.md) — `tz` cookie, Intl timezone detection, fallback
- [How It Works Page](ux/how-it-works.md) — Game rules explanation, scoring tables, bot eligibility

### Database

- [Schema](database/schema.md) — All tables with columns and constraints
- [Migrations](database/migrations.md) — Supabase CLI migration list with purposes

### Testing

- [Testing Standards](testing/standards.md) — TESTING_STANDARD.md, golden-value discipline
- [Test Infrastructure](testing/infrastructure.md) — Vitest config, server-only stub, path aliases
- [Critical Module Guard](testing/critical-module-guard.md) — CI-enforced golden-value/test-first gate
- [Verification Scripts](testing/verification-scripts.md) — Scripted simulations for bootstrap, scope isolation

### Other

- [API Routes Overview](api-routes/overview.md) — All API routes, common patterns, CSRF
- [Leaderboard Ranking](leaderboard/ranking.md) — Dense competition ranking with ties
- [Kickoff Formatting](dates/kickoff-formatting.md) — Timezone-aware kickoff display, countdown
- [Scripts Overview](scripts/overview.md) — Admin scripts, seed scripts, lib mirror

## Task routing table

| Intent                           | Start here                                                | Key source files                                            | Tests                                       |
| -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Understand login flow            | [Login Flow](auth/login-flow.md)                          | `login/page.tsx`, `api/auth/login/route.ts`                 | `login/page.test.ts`, `login/route.test.ts` |
| Add a new auth feature           | [Security Model](architecture/security-model.md)          | `lib/auth/*`, `app/_lib/session-cookie.ts`                  | `lib/auth/*.test.ts`                        |
| Change match selection rules     | [Match Selection Rules](match-selection/rules.md)         | `lib/match-selection/rules.ts`                              | `rules.test.ts`                             |
| Modify Pick Board display        | [Pick Board Overview](pick-board/overview.md)             | `app/page.tsx`, `app/_lib/pick-board-access.ts`             | `pick-board-access.test.ts`                 |
| Change scoring formula           | [Match Scoring](scoring/match-scoring.md)                 | `components/scoring/match-breakdown.ts`                     | `ScoringBreakdown.test.ts`                  |
| Change Predict the Table scoring | [Predict Table Scoring](scoring/predict-table-scoring.md) | `lib/scoring/predict-table.ts`                              | `predict-table.test.ts`                     |
| Add/modify database migration    | [Migrations](database/migrations.md)                      | `supabase/migrations/*.sql`                                 | Verify scripts                              |
| Add a new bot type               | [Bot Players](architecture/bot-players.md)                | `lib/scoring/predict-table.ts`, `lib/competitions/scope.ts` | Various                                     |
| Work on standings sync           | [Sync Overview](standings-sync/overview.md)               | `api/sync/standings/route.ts`                               | `map-standings.test.ts`                     |
| Add a new API route              | [API Routes Overview](api-routes/overview.md)             | Pattern in `api/*/route.ts` files                           | Route test files                            |
| Change UI styling                | [Design Tokens](design-system/tokens.md)                  | `app/globals.css`, `lib/teams/kit-colors.ts`                | `kit-colors.test.ts`                        |
| Add a new environment            | [Architecture Overview](architecture/overview.md)         | `scripts/*.mjs`, `CLAUDE.md`                                | Verification scripts                        |
| Understand data isolation        | [Scope Model](competitions/scope-model.md)                | `lib/competitions/scope.ts`                                 | `scope.test.ts`, verify script              |

## Key invariants

1. **All DB access is server-only** — never import `supabase/server.ts` from a Client Component
2. **Picks/scores scoping** — always join through `players.competition_id`, never filter by `match_id` alone
3. **Golden-value discipline** — any change to `src/lib/**` requires a paired test with ≥6 literal-value assertions and test-first commit ordering
4. **No CSRF bypass** — all state-changing routes check `x-tipperoos-client` header
5. **Lock enforcement is server-side** — `isMatchLocked()` runs on every picks save, not just in the UI
6. **Competition codes per environment** — staging and production use different codes
