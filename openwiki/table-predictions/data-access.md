---
type: concept
title: Table Prediction Data Access
description: DB-fetching glue layer between the pure decision logic and the API routes/PredictTable page, providing database time, gameweek-one kickoff, editability, player lookup, and table-prediction record queries.
tags: [table-prediction, data-access, supabase, queries, database-time]
---

# Table Prediction Data Access

The module at `src/app/_lib/table-prediction-access.ts` provides the Supabase-round-trip glue for the table prediction feature. It deliberately sits outside `src/lib/` — the pure decision logic it wraps already has golden-value tests in `rules.test.ts`.

## Exports

### `getDatabaseTime(supabase)`

Returns the current database timestamp by calling `supabase.rpc("get_db_time")` — a Postgres function that executes `SELECT current_timestamp;`.

The `get_db_time` RPC was added in migration `20260813020000` (issue #132). It is granted only to `service_role`, so it runs with the server's service-role client.

Used by:

- The Pick Board page (`/`) to gate the table prediction prompt (`databaseTime < TABLE_PREDICTION_DEADLINE`)
- The Predict Table page to pass DB time instead of server time to `getTablePredictionEditability()`

```typescript
async function getDatabaseTime(supabase): Promise<Date | null>;
```

Returns `null` if the RPC call fails.

### `getGameweekOneKickoff(supabase)`

Returns the earliest kickoff time for the current season — used to determine whether a player is a Late Joiner.

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

Used by the **skip route** and the **PredictTable page**. The assign/unassign/submit routes no longer call this — their lock check happens inside their transactional Postgres RPC.

### `getPlayerForTablePrediction(supabase, playerId)`

Returns `{ id, joinedAt }` for the session's player. Used by the **PredictTable page** (not by the assign/unassign/submit API routes).

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
- [Database Migrations - deadline migration](../database/migrations.md)
