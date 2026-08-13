---
type: concept
title: Testing Standards
description: Golden-value/test-first discipline for consequence-critical modules (src/lib/**), scripted simulations for multi-step scenarios, and CI enforcement via critical-module guard.
tags: [testing, standards, golden-value, test-first, ci]
---

# Testing Standards

The testing strategy is defined in `docs/standards/TESTING_STANDARD.md`. It establishes three tiers:

## Tier 1a: Pure decision logic (golden-value testing)

Modules in `src/lib/**` must have **golden-value tests** — tests that assert specific numeric expected values rather than just "a test exists":

```typescript
// Good: asserts the exact expected score
expect(scorePredictTable(prediction, actual)).toEqual({
  totalScore: 12,
  placementScore: 10,
  bandBonusScore: 0,
  boldCallScore: 0,
  // ...
});
```

Modules with golden-value tests:

- `scoring/predict-table.ts` → `predict-table.test.ts` (15817 bytes)
- `scoring` match-breakdown → `ScoringBreakdown.test.ts`
- `table-predictions/board.ts` → `board.test.ts` (7454 bytes)
- `table-predictions/rules.ts` → `rules.test.ts` (6575 bytes)
- `match-selection/rules.ts` → `rules.test.ts` (13300 bytes)
- `competitions/scope.ts` → `scope.test.ts` (4334 bytes)
- `auth/scrypt-secret.ts` → `scrypt-secret.test.ts` (2997 bytes)
- `auth/lockout.ts` → `lockout.test.ts` (3670 bytes)
- `auth/emoji-options.ts` → `emoji-options.test.ts` (3239 bytes)
- `auth/competitions.ts` → `competitions.test.ts` (2750 bytes)
- `auth/session.ts` → `session.test.ts` (2730 bytes)
- `auth/signup-validation.ts` → `signup-validation.test.ts` (4163 bytes)
- `leaderboard/rank.ts` → `rank.test.ts` (3178 bytes)
- `gameweeks/resolve.ts` → `resolve.test.ts` (4666 bytes)
- `dates/kickoff-format.ts` → `kickoff-format.test.ts` (4333 bytes)
- `standings/map-standings.ts` → `map-standings.test.ts` (3314 bytes)
- `teams/kit-colors.ts` → `kit-colors.test.ts` (5044 bytes)

## Tier 1b: Scripted simulations (integration verification)

For multi-step scenarios that span migrations, RPCs, and scripts:

- `scripts/verify-bootstrap-competition.mjs` — proves the `create_competition_with_admin()` RPC, collision guard, and multi-competition selector work together
- `scripts/verify-competition-scope-isolation.mjs` — proves `scoresForCompetition`/`picksForMatch` never leak data across competitions

These run against staging (not local Postgres), clean up after themselves via `finally` blocks. Not CI gates — run manually before trusting these flows.

## Critical-module guard (`scripts/ci/critical-module-guard.mjs`)

Enforced in CI on every PR that touches `src/lib/**`:

1. **Paired test required**: any changed `src/lib/**/*.ts` (non-test) must have a corresponding test change in the same diff
2. **Minimum 6 literal-value assertions**: the test must assert ≥6 specific numeric values (`toBe(n)` or `toEqual(n)`)
3. **Test-first discipline**: the test file's first commit in the PR must precede the implementation file's first commit

This prevents self-consistent-but-wrong pairs where implementation and test are written in the same pass.

## Unit tests for the rest

Components, pages, and other non-lib modules use conventional unit tests:

- `src/app/login/page.test.ts` — login flow
- `src/app/api/picks/route.test.ts` — picks upsert
- `src/app/_lib/pick-board-access.test.ts` — pick board data loading
- `scripts/lib/parity.test.ts` — ensures scripts and src/lib stay in sync
- `scripts/lib/team-names.test.ts` — team name formatting

## Related

- [Test Infrastructure](infrastructure.md)
- [Critical Module Guard](critical-module-guard.md)
- [TESTING_STANDARD.md](../../docs/standards/TESTING_STANDARD.md)
