---
type: concept
title: Table Prediction Capture Rules
description: The 7 Table Bands, team-to-band assignment model, validation of band sizes, late-joiner rules, and editability/lock timing for Predict the Table. Lock is based on a fixed UTC deadline, not Gameweek 1 kickoff.
tags: [table-prediction, bands, rules, late-joiner, adr-0003, adr-0008]
---

# Table Prediction Capture Rules

The Table Prediction feature asks players to sort all 20 Premier League clubs into 7 Table Bands — a prediction of the season's final finishing order. Only Band membership scores (not order within a Band). The rules module at `src/lib/table-predictions/rules.ts` defines the pure validation and editability logic.

## The 7 Table Bands

| Band              | Key                 | Positions | Target size | Bonus |
| ----------------- | ------------------- | --------- | ----------- | ----- |
| Champion          | `champion`          | 1st       | 1           | 15    |
| Champions League  | `champions_league`  | 2nd–5th   | 4           | 15    |
| Europe            | `europe`            | 6th–8th   | 3           | 10    |
| Mid Table         | `mid_table`         | 9th–11th  | 3           | 10    |
| Lower Table       | `lower_table`       | 12th–14th | 3           | 10    |
| Relegation Battle | `relegation_battle` | 15th–17th | 3           | 10    |
| Relegated         | `relegated`         | 18th–20th | 3           | 15    |

Total teams: **20** (TOTAL_TEAMS constant)

## Band validation

`validateBandCounts(counts)` checks a player's current assignment against target sizes:

```typescript
function validateBandCounts(
  counts: Partial<Record<BandKey, number>>,
): BandValidationResult {
  // Returns mismatches (band, expected, actual) and unsorted count
  // ok = true only if all bands have exactly their target size and no teams are unsorted
}
```

Validation never blocks submission — a wrongly-sized Band simply forfeits its Band Bonus (ADR-0008).

## Lock timing

The lock deadline is a **fixed date** encoded as a constant in the rules module:

```typescript
// End of 31 August 2026 in Australia/Sydney, represented in UTC.
// The cutoff is exclusive: requests at or after this instant are locked.
export const TABLE_PREDICTION_DEADLINE = new Date("2026-08-31T14:00:00.000Z");
```

This replaces the original design which locked at Gameweek 1's first kickoff. The change was made via commit 815a0e7 (issue #132) to make the deadline authoritative to Postgres time and independent of fixture scheduling.

## Late joiner rules

A Late Joiner is a player who signed up **after Gameweek 1's first kickoff**:

```typescript
function isLateJoiner(
  joinedAt: Date,
  gameweekOneKickoff: Date | null,
): boolean {
  if (!gameweekOneKickoff) return false;
  return joinedAt.getTime() > gameweekOneKickoff.getTime();
}
```

| Player type                 | Can edit? | Lock deadline                                     | Can skip?      |
| --------------------------- | --------- | ------------------------------------------------- | -------------- |
| On-time (joined before GW1) | Yes       | **2026-08-31T14:00:00Z** (fixed, not GW1 kickoff) | No (mandatory) |
| Late Joiner                 | Yes       | **Never locked**                                  | Yes            |

### For on-time players

- Editable until `2026-08-31T14:00:00Z` (end of 31 August in Australia/Sydney)
- Locked after that — no changes possible
- Lock is independent of whether Gameweek 1's kickoff is known yet

### For Late Joiners

- Always editable (never locked)
- May submit at any time after joining, or skip entirely

## Editability function

`getTablePredictionEditability(params)` encapsulates the full lock logic:

```typescript
interface TablePredictionEditability {
  editable: boolean;
  locked: boolean;
  isLateJoiner: boolean;
}
```

For on-time players, `locked` is `true` when `params.now >= TABLE_PREDICTION_DEADLINE`. The `gameweekOneKickoff` parameter is only used for classifying Late Joiners, not for the lock check.

## Implementation note: DB time vs application-server time

The lock check on the **server API routes** (assign, unassign, submit) uses **Postgres DB time** via a transactional RPC (`table_prediction_lock_status`) that calls `get_db_time()`. The **PredictTable page** server component also fetches `getDatabaseTime()` and passes it as `now` to `getTablePredictionEditability()`.

**Divergence**: The Pick Board page (`/`) uses `databaseTime` for the table prediction prompt gate but the regular match picks route (`POST /api/picks`) uses `new Date()` (application-server time) for both `isMatchLocked()` and the `updated_at` timestamp. See [Picks Route](../api-routes/picks.md).

## Related

- [Table Prediction Board](board-logic.md)
- [Table Prediction React Flow](react-flow.md)
- [Table Prediction API Routes](api-routes.md)
- [Table Prediction Data Access](data-access.md)
- [Predict Table Scoring](../scoring/predict-table-scoring.md)
- [ADR-0003: Predict the Table Shape](../../docs/adr/0003-predict-the-table-shape.md)
- [ADR-0008: Predict the Table Group Fill Capture](../../docs/adr/0008-predict-the-table-group-fill-capture.md)
