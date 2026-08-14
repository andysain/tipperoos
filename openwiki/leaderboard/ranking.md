---
type: concept
title: Leaderboard Ranking
description: Dense/standard competition ranking with tie-break for the Pick Board's stats strip. Pure-function sorting, no skipped numbers in tied ranks.
tags: [leaderboard, ranking, ties, sorting]
---

# Leaderboard Ranking

The leaderboard ranking logic in `src/lib/leaderboard/rank.ts` implements **dense/standard competition ranking** — tied players share a place, and the next distinct point value takes the next rank with no gap.

## Algorithm

```typescript
function rankScores(scores: ScoreInput[]): RankedScore[];
```

1. Sort by points, descending
2. Assign ranks densely: `[100, 100, 90, 85, 85]` → `[1, 1, 2, 3, 3]`

No "1, 1, 3" skipped-rank style (that's "competition ranking" with gaps — explicitly rejected). The algorithm uses a `rankByPoints` map to assign the same rank to tied scores and increment by 1 for each new distinct score value.

## Input/Output

```typescript
interface ScoreInput {
  playerId: string;
  points: number;
}

interface RankedScore extends ScoreInput {
  rank: number;
}
```

## Context

Scores come from `scoresForCompetition()` in `src/lib/competitions/scope.ts`, which:

1. Fetches all players in the competition
2. Fetches their aggregate score rows for the current season
3. Folds players with no scores in at 0 (so Late Joiners and brand-new players appear)

The ranking is then applied as a pure transformation on the folded scores.

## Related

- [Competition Scope Model](../competitions/scope-model.md)
- [Pick Board Overview](../pick-board/overview.md)
- [Match Scoring](../scoring/match-scoring.md)
