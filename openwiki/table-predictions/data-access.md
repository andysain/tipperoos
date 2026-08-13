---
type: concept
title: Table Prediction Data Access
description: DB-fetching glue layer between the pure decision logic and the API routes, providing gameweek-one kickoff, editability, player lookup, and table-prediction record queries.
tags: [table-prediction, data-access, supabase, queries]
---

# Table Prediction Data Access

The module at `src/app/_lib/table-prediction-access.ts` provides the Supabase-round-trip glue for the table prediction feature. It deliberately sits outside `src/lib/` — the pure decision logic it wraps already has golden-value tests in `rules.test.ts`.

## Exports

### `getGameweekOneKickoff(supabase)`

Returns the earliest kickoff time for the current season — used to determine whether a player is a Late Joiner and whether the prediction window has closed.

```typescript
// Derivation: earliest match kickoff in the current season
// Returns null if season/fixtures haven't been seeded yet
```

This works because all 380 fixtures are seeded up front, and gameweek 1 is chronologically first — the season-wide earliest kickoff is exactly GW1's first match.

### `getTablePredictionEditabilityForPlayer(supabase, { joinedAt, now })`

Wraps the pure `getTablePredictionEditability()` with the `gameweekOneKickoff` Supabase fetch:

```typescript
async function getTablePredictionEditabilityForPlayer(
  supabase,
  { joinedAt, now },
) {
  const gameweekOneKickoff = await getGameweekOneKickoff(supabase);
  return getTablePredictionEditability({ joinedAt, now, gameweekOneKickoff });
}
```

### `getPlayerForTablePrediction(supabase, playerId)`

Returns `{ id, joinedAt }` for the session's player. Used by all four table-prediction routes to establish the player's identity before applying lock/late-joiner rules.

### `getTablePredictionRecord(supabase, playerId)`

Returns `{ id, submittedAt, skipped }` — the player's table prediction status. Shared by:

- The Pick Board page (to determine whether to show the Table Prediction Prompt)
- The Predict Table page (to restore previous state and show submission status)

A row with neither `submitted_at` nor `is_skipped` set exists mid-sort (moves persist immediately) and counts as neither. Null means the player has never touched the flow.

## Design principle

All DB-fetching glue follows the same pattern: a thin function that calls Supabase, then delegates the decision logic to a pure function in `src/lib/`. This keeps golden-value tests on the pure functions and avoids testing round-trips.

## Related

- [Capture Rules](capture-rules.md)
- [API Routes](api-routes.md)
- [React Flow](react-flow.md)
