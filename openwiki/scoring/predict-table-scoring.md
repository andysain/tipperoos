---
type: concept
title: Predict Table Scoring
description: Three-component scoring formula — Placement, Band Bonus, and Bold Call — summing to 200 max. Pure-function implementation with cohort-aware Bold Call computation.
tags: [scoring, table-prediction, placement, band-bonus, bold-call, adr-0010]
---

# Predict Table Scoring

The Predict Table scoring formula (max 200 points) is defined in `src/lib/scoring/predict-table.ts`. It has three components:

| Component  | Max points | Description                                                                           |
| ---------- | ---------- | ------------------------------------------------------------------------------------- |
| Placement  | 100        | 5/2/1/0 by Band distance (0 / 1 / 2 / 3+ bands away)                                  |
| Band Bonus | 85         | Exact full membership per Band (15 for Champion, UCL, Relegated; 10 for others)       |
| Bold Call  | 15         | +3 per correct placement that fewer than ~1/10 of eligible players made; best 5 count |

## Placement scoring

For each team, compare the predicted Band index with the actual Band index:

```typescript
function teamScore(
  predictedBandIndex: number,
  actualBandIndex: number,
): number {
  const bandDistance = Math.abs(predictedBandIndex - actualBandIndex);
  return PLACEMENT_POINTS_BY_DISTANCE[bandDistance] ?? 0;
}
```

| Distance       | Points |
| -------------- | ------ |
| 0 (right Band) | 5      |
| 1 Band away    | 2      |
| 2 Bands away   | 1      |
| 3+ Bands away  | 0      |
| Unplaced       | 0      |

**Max placement**: 20 teams × 5 = 100

## Band Bonus

Awarded for predicting one Band's full membership **exactly** — same set of teams, any order within the Band:

| Band              | Bonus |
| ----------------- | ----- |
| Champion          | 15    |
| Champions League  | 15    |
| Europe            | 10    |
| Mid Table         | 10    |
| Lower Table       | 10    |
| Relegation Battle | 10    |
| Relegated         | 15    |

**Max Band Bonus**: 85. An over- or under-filled Band simply forfeits its bonus.

## Bold Call

A correct placement earns +3 if it was made by **no more than roughly one in ten** of the frozen Gameweek-1 cohort of eligible players.

The rarity predicate is the module-private `isRare(agreeCount, cohortSize)` — there is no exported `isBoldCall`; grep for `isRare` when you need it:

```typescript
function isRare(agreeCount: number, cohortSize: number): boolean {
  return agreeCount <= Math.max(1, Math.floor(cohortSize / 10));
}
```

- Competitions with <10 eligible players still allow one lone correct call
- **Stale source comment**: the module header comment in `src/lib/scoring/predict-table.ts` still says Bold Calls need "fewer than a third" of the cohort. The code and `isRare`'s own doc comment are correct at one in ten; the header is the outdated one. Fixing it needs a paired test change to clear the critical-module guard
- Only the **best 5** Bold Calls count per player (`MAX_BOLD_CALLS = 5`, `BOLD_CALL_BONUS = 3`)
- Bold Calls are inherently a cohort property — computed by `scorePredictTableCohort()`
- Late Joiners sit outside the Bold Call process (earn none, count toward nobody's rarity)

## Pure-function architecture

The scoring functions are pure:

- `scorePredictTable(predictedBands, actualOrder)` — Placement + Band Bonus only
- `scorePredictTableCohort(cohortEntries, actualOrder)` — full score including Bold Calls

`scorePredictTableCohort` calls `scorePredictTable` per player and then computes Bold Calls from the cohort's collective predictions.

## Band definitions (dual sources)

Two modules define the same 7 bands:

- `src/lib/table-predictions/rules.ts` — capture rules (user-facing labels, target sizes)
- `src/lib/scoring/predict-table.ts` — scoring rules (same bands with scoring bonuses)

Both must stay in sync — they define the same `TABLE_BANDS` structure with different properties.

## Band index mapping

`bandIndexForRank(rank)` maps a 1-indexed final table position to a 0-indexed Band:

```
Band 0: Champion       (rank 1)
Band 1: Champions Lg   (ranks 2-5)
Band 2: Europe         (ranks 6-8)
...
Band 6: Relegated      (ranks 18-20)
```

## Related

- [Match Scoring](match-scoring.md)
- [Capture Rules](../table-predictions/capture-rules.md)
- [ADR-0010: Predict the Table Scoring](../../docs/adr/0010-predict-the-table-scoring.md)
