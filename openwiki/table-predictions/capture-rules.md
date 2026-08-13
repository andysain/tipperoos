---
type: concept
title: Table Prediction Capture Rules
description: The 7 Table Bands, team-to-band assignment model, validation of band sizes, late-joiner rules, and editability/lock timing for Predict the Table.
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

| Player type                 | Can edit? | Lock deadline      | Can skip?      |
| --------------------------- | --------- | ------------------ | -------------- |
| On-time (joined before GW1) | Yes       | Gameweek 1 kickoff | No (mandatory) |
| Late Joiner                 | Yes       | **Never locked**   | Yes            |

## Editability function

`getTablePredictionEditability(params)` encapsulates the full lock logic:

```typescript
interface TablePredictionEditability {
  editable: boolean;
  locked: boolean;
  isLateJoiner: boolean;
}
```

### For on-time players

- Editable until Gameweek 1's first kickoff
- Locked after that — no changes possible

### For Late Joiners

- Always editable (never locked)
- May submit at any time after joining, or skip entirely

## Related

- [Table Prediction Board](board-logic.md)
- [Table Prediction React Flow](react-flow.md)
- [Table Prediction API Routes](api-routes.md)
- [Predict Table Scoring](../scoring/predict-table-scoring.md)
- [ADR-0003: Predict the Table Shape](../../docs/adr/0003-predict-the-table-shape.md)
- [ADR-0008: Predict the Table Group Fill Capture](../../docs/adr/0008-predict-the-table-group-fill-capture.md)
