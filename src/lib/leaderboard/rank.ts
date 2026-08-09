// Pure ranking logic for the Pick Board's stats strip (issue #90, decision
// 3/4). Season totals come from `scoresForCompetition`
// (src/lib/competitions/scope.ts); this module only does the sort + rank
// assignment, kept separate and pure so it's golden-value testable on its
// own numbers (docs/standards/TESTING_STANDARD.md section 1a).
//
// Tie-break: dense/standard competition ranking -- tied players share a
// place and the next distinct point value takes the next rank with no gap
// (1, 1, 3, not 1, 1, 3 skipped to 4-style "1, 1, 4"... i.e. no skipped
// numbers at all). No CLAUDE.md rule specifies this; it's the plain-language
// default "leaderboard" already implies. See issue #90's decision log.

export interface ScoreInput {
  playerId: string;
  points: number;
}

export interface RankedScore extends ScoreInput {
  rank: number;
}

export function rankScores(scores: readonly ScoreInput[]): RankedScore[] {
  const sorted = [...scores].sort((a, b) => b.points - a.points);

  const rankByPoints = new Map<number, number>();
  let nextRank = 1;
  for (const { points } of sorted) {
    if (!rankByPoints.has(points)) {
      rankByPoints.set(points, nextRank);
      nextRank += 1;
    }
  }

  return sorted.map((row) => ({
    ...row,
    rank: rankByPoints.get(row.points)!,
  }));
}
