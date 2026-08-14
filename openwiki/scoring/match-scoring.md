---
type: concept
title: Match Scoring
description: Additive match scoring formula — Right Result, Right Goal Difference, Home/Away Team Score, Wrong Way Round — with pure-function breakdown and UI display.
tags: [scoring, match, formula, adr-0009]
---

# Match Scoring

Each tipped match scores 0–7 points. All points stack, except Wrong Way Round which is mutually exclusive. The formula is defined in `src/components/scoring/match-breakdown.ts`.

## Scoring terms

| Term                  | Points | Condition                                                                                                      |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Right Result          | +3     | Correct winner (or correct draw)                                                                               |
| Right Goal Difference | +2     | Correct margin (result must also be right)                                                                     |
| Home team's score     | +1     | Correct home score (result must also be right)                                                                 |
| Away team's score     | +1     | Correct away score (result must also be right)                                                                 |
| **Wrong Way Round**   | **+1** | Exact scoreline with sides swapped (finishes 2-1, you predicted 1-2). Mutually exclusive with all other terms. |

**Maximum per match**: 7 (right result + right GD + both scores correct)

**No pick**: 0 points. Picks are never filled in automatically.

## Formula implementation

`getMatchBreakdown(pickHome, pickAway, resultHome, resultAway)` returns:

```typescript
{
  wrongWayRound: boolean;   // true = all other terms are 0
  rows: BreakdownRow[];     // individual term scores (empty for WWR)
  total: number;            // sum of all points
}
```

### Wrong Way Round detection

```typescript
const wrongWayRound =
  pickHome === resultAway && pickAway === resultHome && pickHome !== pickAway; // can never occur on a draw
```

### Constraint on team-score points

Home and Away score points require the result to be correct first (the `detail` field reads "The result must also be right" when it doesn't apply).

## Scoring breakdown UI

The `ScoringBreakdown` component (`src/components/scoring/ScoringBreakdown.tsx`) is an inline expandable panel on the Tipped Match Card showing:

- Each scoring term and whether it was earned
- Wrong Way Round display
- Total points badge
- Link to How It Works

## Scoring summary

The `ScoringSummary` component (`src/components/scoring/ScoringSummary.tsx`) is a collapsible panel shown on the Pick Board and Predict Table pages, explaining the scoring rules to players. It re-exports:

- `WeeklyScoringTable` — match scoring terms table
- `TableScoringTable` — predict-table scoring terms table

## Related

- [Predict Table Scoring](predict-table-scoring.md)
- [Tipped Match Card](../pick-board/tipped-match-card.md)
- [ADR-0009: Match Scoring Formula and Title Eligibility](../../docs/adr/0009-match-scoring-formula-and-title-eligibility.md)
