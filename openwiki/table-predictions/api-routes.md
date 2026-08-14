---
type: concept
title: Table Prediction API Routes
description: Three route handlers (assign, unassign, submit) now backed by transactional Postgres RPCs that enforce the lock deadline against DB time. Direct CRUD and retry logic replaced.
tags: [table-prediction, api, routes, rpc, lock, late-joiner, deadline]
---

# Table Prediction API Routes

Three API routes handle table prediction operations. All require the `x-tipperoos-client` CSRF header and a valid session cookie.

## Route overview

| Route                             | Method | Operation                     | Lock check? | Late-joiner gate?                 |
| --------------------------------- | ------ | ----------------------------- | ----------- | --------------------------------- |
| `/api/table-predictions/assign`   | POST   | Assign/re-assign team to band | **RPC**     | No (Late Joiners always editable) |
| `/api/table-predictions/unassign` | POST   | Remove team from band         | **RPC**     | No                                |
| `/api/table-predictions/submit`   | POST   | Confirm current assignment    | **RPC**     | No                                |
| `/api/table-predictions/skip`     | POST   | Skip (Late Joiners only)      | No          | **Yes** — only Late Joiners       |

## Common security pattern

All routes follow this flow:

```
1. hasCsrfHeader(request) → 403 if missing
2. getSessionPlayerId() → 401 if no session
3. Call Postgres RPC (lock check + mutation in one transaction)
4. Interpret RPC result code
```

The lock check and mutation happen **atomically inside the Postgres RPC** — the route no longer reads `getPlayerForTablePrediction()` or `getTablePredictionEditabilityForPlayer()` from the data-access layer before each write. See [the deadline migration](../../supabase/migrations/20260813020000_table_prediction_deadline.sql) for the RPC definitions.

## Route details

### POST /api/table-predictions/assign

Persists one team→Band move immediately (safe resume — moves aren't lost on browser close).

```json
// Request
{ "teamId": "uuid", "band": "champion" }

// Behavior
- Calls table_prediction_assign(p_player_id uuid, p_team_id uuid, p_band text) RPC
- RPC checks lock status first, then upserts/reassigns in one transaction
- Automatically creates table_predictions row if none exists (player_id ON CONFLICT)
- Assigns predicted_rank as smallest unused 1-20
```

**Concurrency handling**: The RPC uses `SELECT ... FOR UPDATE` on the relevant rows, so concurrent requests serialize at the database level. No application-level retry loop is needed — the old route's three-attempt retry for `23505` (unique violation) has been replaced by the transactional RPC.

**Error codes** returned as `result`:

- `"saved"` — success
- `"locked"` — deadline has passed, 403 response
- `"player_not_found"` — invalid session player, 500 response
- `"invalid_team"` — team_id doesn't reference a real team, 400 response

### POST /api/table-predictions/unassign

Removes a team from its band (back to roster).

```json
// Request
{ "teamId": "uuid" }

// Behavior
- Calls table_prediction_unassign(p_player_id uuid, p_team_id uuid) RPC
- RPC checks lock, then deletes the table_prediction_ranks row
- Clears submitted_at on the prediction row (un-confirms)
- Returns "saved" even if no prediction row existed (idempotent)
```

### POST /api/table-predictions/submit

Marks the current assignment as confirmed.

Re-submittable any number of times until lock. Submitting never blocks on untidy band sizes — a wrongly-sized Band simply forfeits its bonus.

```json
// Behavior
- Calls table_prediction_submit(p_player_id uuid) RPC
- RPC checks lock, then updates submitted_at to DB current_timestamp
- Returns { submittedAt: ISO string } on success
```

**Error codes**:

- `"locked"` — deadline has passed, 403 response
- `"player_not_found"` — invalid session player, 500 response
- `"no_prediction"` — no assigned teams yet, 400 response

### POST /api/table-predictions/skip

Only available to Late Joiners (checked server-side via `isLateJoiner()`). Sets `is_skipped = true`.

## Data access layer

The module at `src/app/_lib/table-prediction-access.ts` provides:

- `getDatabaseTime()` — calls `supabase.rpc("get_db_time")` for DB-current time
- `getGameweekOneKickoff()` — earliest match kickoff, used for Late Joiner classification
- `getTablePredictionEditabilityForPlayer()` — wraps pure `getTablePredictionEditability()` (used by the skip route and the PredictTable page, but **no longer** by assign/unassign/submit routes)
- `getPlayerForTablePrediction()` — player lookup (still used by the PredictTable page)
- `getTablePredictionRecord()` — shared by Pick Board prompt and PredictTable page

## Schema

The table prediction data lives in two tables:

- `table_predictions` — one row per player (`player_id`, `submitted_at`, `is_skipped`, `updated_at`)
- `table_prediction_ranks` — one row per team per prediction (`table_prediction_id`, `team_id`, `band`, `predicted_rank`)

## Related

- [Capture Rules](capture-rules.md)
- [Board Logic](board-logic.md)
- [React Flow](react-flow.md)
- [Database Migrations - deadline migration](../database/migrations.md)
