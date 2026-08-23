import { rankScores } from "./rank";

/**
 * The Pick Board's three-row ladder: the viewer and their nearest
 * neighbours (docs/adr/0013-match-centre-tense-and-axes.md D15).
 *
 * Pure, because two things about it are product decisions rather than
 * plumbing: which players count toward the ranking, and how the window
 * behaves at the ends of the table.
 */
export interface LadderInput {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  points: number;
}

export interface LadderRow {
  playerId: string;
  displayName: string;
  emoji: string | null;
  rank: number;
  points: number;
  isViewer: boolean;
}

export function buildLadder(
  rows: readonly LadderInput[],
  viewerId: string,
): LadderRow[] {
  // Bots are excluded before ranking, not hidden after it. They can't win
  // the season (docs/adr/0012 D12), so they can't be caught or lost to --
  // and the rank shown here has to match the leaderboard's, or the two
  // surfaces tell one player two different things on the same day.
  const humans = rows.filter((r) => !r.isBot);
  if (humans.length === 0) return [];

  const rankById = new Map(
    rankScores(
      humans.map((h) => ({ playerId: h.playerId, points: h.points })),
    ).map((r) => [r.playerId, r.rank]),
  );

  const ordered = humans
    .map((h) => ({
      playerId: h.playerId,
      displayName: h.displayName,
      emoji: h.emoji,
      rank: rankById.get(h.playerId) ?? humans.length,
      points: h.points,
      isViewer: h.playerId === viewerId,
    }))
    .sort(
      (a, b) => a.rank - b.rank || a.displayName.localeCompare(b.displayName),
    );

  // Always three rows, wherever the viewer sits: at the top they see the two
  // below them, at the bottom the two above. A two-row edge case would
  // change the block's shape at exactly the moments a player is most
  // invested in it.
  const i = ordered.findIndex((r) => r.isViewer);
  if (i === -1 || ordered.length <= 3) return ordered;
  if (i === 0) return ordered.slice(0, 3);
  if (i === ordered.length - 1) return ordered.slice(-3);
  return ordered.slice(i - 1, i + 2);
}
