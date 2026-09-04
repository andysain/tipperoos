// Pure ranking logic for the Pick Board's stats strip (issue #90, decision
// 3/4). Season totals come from `scoresForCompetition`
// (src/lib/competitions/scope.ts); this module only does the sort + rank
// assignment, kept separate and pure so it's golden-value testable on its
// own numbers (docs/standards/TESTING_STANDARD.md section 1a).
//
// Tie-break: standard ("skip"/"1224") competition ranking -- tied players
// share a place, and the next distinct point value's rank accounts for
// every player already ranked above it (1, 1, 3, not 1, 1, 2). This
// reversed an earlier dense-rank default (see issue #90's original decision
// log) -- see issue #204: this is the convention a football table already
// uses, and the one most people mean by "leaderboard rank."

export interface ScoreInput {
  playerId: string;
  points: number;
}

export interface RankedScore extends ScoreInput {
  rank: number;
}

export function rankScores(scores: readonly ScoreInput[]): RankedScore[] {
  const sorted = [...scores].sort((a, b) => b.points - a.points);

  // Skip ranking: a player's rank is their 1-based position in the sorted
  // list, except a tie reuses the rank of the first player with the same
  // points -- so the next distinct value's rank is its own position,
  // accounting for every tied player above it (two tied at 3rd -> next
  // distinct is 5th, not 4th).
  let rankForCurrentValue = 1;
  return sorted.map((row, index) => {
    if (index === 0 || sorted[index - 1].points !== row.points) {
      rankForCurrentValue = index + 1;
    }
    return { ...row, rank: rankForCurrentValue };
  });
}
