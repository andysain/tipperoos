// Pure composition for the leaderboard's Predict the Table segment (issue
// #171) -- docs/adr/0012-leaderboard-view.md D13. Mirrors board.ts's shape
// (dense rank over an eligible subset, kept free of `server-only` and any
// Supabase type so it's golden-value testable on its own numbers per
// docs/standards/TESTING_STANDARD.md §1a); the DB read lives in
// src/app/_lib/table-leaderboard-access.ts.
//
// Three divergences from the season board, all from D13:
//   - No Bots at all (not even ranked-past, per season board's D12) --
//     bots don't submit a Predict the Table, so the caller never includes
//     them in `scores`.
//   - A Late Joiner is ineligible for rank here (unlike the season title):
//     rendered at their true list position, real score intact, but with
//     no rank number -- same treatment the season board gives a Bot.
//   - No movement, ever: nothing stores Table Prediction score history to
//     diff against (D13), so this board has no equivalent of `movement`.

import { rankScores } from "./rank";

export interface TableLeaderboardScoreInput {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
  totalScore: number;
  placementScore: number;
  bandBonusScore: number;
  boldCallScore: number;
}

export interface TableLeaderboardRow {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
  /** Dense rank over non-Late-Joiners only; null for a Late Joiner (D13). */
  rank: number | null;
  totalScore: number;
  placementScore: number;
  bandBonusScore: number;
  boldCallScore: number;
  isViewer: boolean;
}

export function buildTableLeaderboard(
  scores: readonly TableLeaderboardScoreInput[],
  viewerId: string,
): TableLeaderboardRow[] {
  const eligibleRanks = new Map(
    rankScores(
      scores
        .filter((row) => !row.isLateJoiner)
        .map((row) => ({ playerId: row.playerId, points: row.totalScore })),
    ).map((row) => [row.playerId, row.rank]),
  );

  return [...scores]
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((row) => ({
      playerId: row.playerId,
      displayName: row.displayName,
      emoji: row.emoji,
      isLateJoiner: row.isLateJoiner,
      rank: row.isLateJoiner ? null : (eligibleRanks.get(row.playerId) ?? null),
      totalScore: row.totalScore,
      placementScore: row.placementScore,
      bandBonusScore: row.bandBonusScore,
      boldCallScore: row.boldCallScore,
      isViewer: row.playerId === viewerId,
    }));
}
