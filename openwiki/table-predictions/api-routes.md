---
type: concept
title: Table Prediction API Routes
description: Four route handlers (assign, unassign, submit, skip) for table prediction CRUD operations, all enforcing session auth, CSRF, lock/late-joiner rules.
tags: [table-prediction, api, routes, crud, lock, late-joiner]
---

# Table Prediction API Routes

Four API routes handle table prediction operations. All require the `x-tipperoos-client` CSRF header and a valid session cookie.

## Route overview

| Route                             | Method | Operation                     | Lock check? | Late-joiner gate?                 |
| --------------------------------- | ------ | ----------------------------- | ----------- | --------------------------------- |
| `/api/table-predictions/assign`   | POST   | Assign/re-assign team to band | Yes         | No (Late Joiners always editable) |
| `/api/table-predictions/unassign` | POST   | Remove team from band         | Yes         | No                                |
| `/api/table-predictions/submit`   | POST   | Confirm current assignment    | Yes         | No                                |
| `/api/table-predictions/skip`     | POST   | Skip (Late Joiners only)      | No          | **Yes** — only Late Joiners       |

## Common security pattern

All four routes follow this flow:

```
1. hasCsrfHeader(request) → 403 if missing
2. getSessionPlayerId() → 401 if no session
3. getPlayerForTablePrediction(supabase, playerId) → 500 if player not found
4. Lock/late-joiner check → 403 if not editable
5. Supabase CRUD operation
```

The editability check reuses `getTablePredictionEditabilityForPlayer()` from `src/app/_lib/table-prediction-access.ts`.

## Route details

### POST /api/table-predictions/assign

Persists one team→Band move immediately (safe resume — moves aren't lost on browser close).

```json
// Request
{ "teamId": "uuid", "band": "champion" }

// Behavior
- Upserts table_predictions row (player_id, is_skipped=false, submitted_at=null)
- Upserts table_prediction_ranks row (team_id, band)
- Auto-assigns predicted_rank (smallest unused 1-20)
- Retry logic (3 attempts) for concurrent-assignment races
```

**Concurrency handling**: Two types of races are handled — both surface as Postgres error code `23505` (unique violation):

1. Same team submitted twice (double tap) → detects existing row via `table_prediction_ranks(team_id)` query, updates band in-place
2. Two teams colliding on `predicted_rank` → the unique constraint `table_prediction_ranks(table_prediction_id, predicted_rank)` fires; the function recomputes the next available rank (smallest 1-20 not in use) and retries

**Foreign-key handling**: If `insertError.code === "23503"` (foreign-key violation — the `team_id` doesn't reference a valid `teams` row), the function returns immediately with a generic save error. It does **not** retry on 23503 because that indicates an invalid request, not a transient race.

The `predicted_rank` computation uses **smallest-unused-1-20** rather than `max(rank) + 1` because ranks are never renumbered when a row is deleted (unassign). Using `max + 1` would eventually walk past 20 and fail the `predicted_rank between 1 and 20` check constraint after enough remove-then-recall cycles. With at most 19 other rows at any point, a free slot in 1-20 always exists.

### POST /api/table-predictions/unassign

Removes a team from its band (back to roster). Deletes the `table_prediction_ranks` row outright.

```json
// Request
{ "teamId": "uuid" }
```

### POST /api/table-predictions/submit

Marks the current assignment as confirmed. Sets `submitted_at` to `now()` and clears `is_skipped`.

Re-submittable any number of times until lock. Submitting never blocks on untidy band sizes — a wrongly-sized Band simply forfeits its bonus.

### POST /api/table-predictions/skip

Only available to Late Joiners (checked server-side via `isLateJoiner()`). Sets `is_skipped = true`.

## Data access layer

All four routes rely on `src/app/_lib/table-prediction-access.ts` for shared DB queries:

- `getGameweekOneKickoff()` — earliest match kickoff as proxy for GW1 start
- `getTablePredictionEditabilityForPlayer()` — lock/late-joiner check
- `getPlayerForTablePrediction()` — player lookup by session ID

## Schema

The table prediction data lives in two tables:

- `table_predictions` — one row per player (`player_id`, `submitted_at`, `is_skipped`)
- `table_prediction_ranks` — one row per team per prediction (`table_prediction_id`, `team_id`, `band`, `predicted_rank`)

## Related

- [Capture Rules](capture-rules.md)
- [Board Logic](board-logic.md)
- [React Flow](react-flow.md)
- [Table Prediction Data Access](data-access.md)
