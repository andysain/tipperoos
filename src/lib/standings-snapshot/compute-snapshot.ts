/**
 * Per-gameweek standings snapshot — issue #23. Pure compute layer, mirroring
 * the scoring engine's layering (issue #21): a pure function fed already-
 * scoped rows, with the DB read (./load-snapshot-inputs.ts) and write
 * (./write-snapshot.ts) kept separate so this stays golden-value testable
 * on its own numbers (docs/standards/TESTING_STANDARD.md §1a).
 *
 * Deliberately does not import from src/lib/competitions/scope.ts (which is
 * "server-only"-tagged) even though its `foldCompetitionScores` does almost
 * the same fold -- keeping this module free of that tag is what lets it stay
 * a plain, client-safe pure function.
 *
 * gameweek_score sums a player's `scores` rows for exactly this gameweek's
 * two Tipped Matches; season_total sums every gameweek 1..N's matches in the
 * same competition+season (D1/D2). season_standing is standard ("skip")
 * competition rank on season_total, rank 1 = best (D3, CONTEXT.md's
 * "Season Standing" entry) -- reusing rankScores rather than reimplementing
 * tie-break logic.
 */

import { rankScores } from "@/lib/leaderboard/rank";

export interface StandingsPlayer {
  playerId: string;
}

export interface StandingsScoreRow {
  playerId: string;
  points: number;
}

export interface PlayerStandingsSnapshot {
  playerId: string;
  gameweekScore: number;
  seasonTotal: number;
  seasonStanding: number;
}

/** Every player starts at 0 so a Late Joiner or a player with no rows yet still appears. */
function foldPoints(
  players: readonly StandingsPlayer[],
  rows: readonly StandingsScoreRow[],
): Map<string, number> {
  const totals = new Map(players.map((p) => [p.playerId, 0]));
  for (const row of rows) {
    totals.set(row.playerId, (totals.get(row.playerId) ?? 0) + row.points);
  }
  return totals;
}

export interface ComputeGameweekStandingsInput {
  players: readonly StandingsPlayer[];
  /** This gameweek's own two Tipped Matches' `scores` rows only. */
  gameweekScoreRows: readonly StandingsScoreRow[];
  /** Every gameweek 1..N's `scores` rows, cumulative through this one. */
  seasonScoreRows: readonly StandingsScoreRow[];
}

/**
 * Takes a named-fields input, not three positional args: `gameweekScoreRows`
 * and `seasonScoreRows` share an identical type, and a positional swap would
 * silently produce a wrong-but-plausible snapshot (backwards gameweek/season
 * points) rather than a type error.
 */
export function computeGameweekStandings({
  players,
  gameweekScoreRows,
  seasonScoreRows,
}: ComputeGameweekStandingsInput): PlayerStandingsSnapshot[] {
  const gameweekTotals = foldPoints(players, gameweekScoreRows);
  const seasonTotals = foldPoints(players, seasonScoreRows);

  const ranked = rankScores(
    players.map((p) => ({
      playerId: p.playerId,
      points: seasonTotals.get(p.playerId) ?? 0,
    })),
  );

  return ranked.map((r) => ({
    playerId: r.playerId,
    gameweekScore: gameweekTotals.get(r.playerId) ?? 0,
    seasonTotal: r.points,
    seasonStanding: r.rank,
  }));
}
