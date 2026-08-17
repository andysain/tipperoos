// Pure composition for the leaderboard route (issue #24) --
// docs/adr/0012-leaderboard-view.md. Kept free of `server-only` and of any
// Supabase type so it stays a plain, golden-value-testable function
// (docs/standards/TESTING_STANDARD.md §1a); the DB reads live in
// src/app/_lib/leaderboard-access.ts.
//
// Three rules from the ADR are implemented here rather than in the route,
// because each is a place a plausible-looking mistake costs correctness:
//
//   D12  Rank is dense over HUMANS ONLY. Bots keep their position in the
//        list by points but carry no rank, so the player sitting behind a
//        bot is 2nd, not 3rd.
//   D2   Movement is the live humans-only rank minus the same humans-only
//        rank recomputed from the previous gameweek's stored season_total.
//        Deliberately NOT `standings_snapshots.season_standing`, which is
//        bot-inclusive by design (#23 D3) -- diffing against it would be
//        off by one for every player below a bot.
//   D3   Points per gameweek played divides by gameweeks since joining,
//        not by gameweeks the player happened to pick in (which would make
//        not picking raise your average).

import { rankScores } from "./rank";

export interface LeaderboardScoreInput {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  joinedAt: string;
  points: number;
  matchesScored: number;
  exactTips: number;
  correctResults: number;
}

export interface ScoredGameweek {
  number: number;
  /** Earliest kickoff among this gameweek's Tipped Matches. */
  earliestKickoffUtcIso: string;
}

export interface PreviousSeasonTotal {
  playerId: string;
  seasonTotal: number;
}

export interface LeaderboardRow {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  /** Dense rank over humans only; null for a bot (D12). */
  rank: number | null;
  /** Places climbed since the previous gameweek; null when unknowable (D2). */
  movement: number | null;
  points: number;
  gameweeksPlayed: number;
  /** points / gameweeksPlayed, or null when they've played none (D3). */
  pointsPerGameweek: number | null;
  exactTips: number;
  correctResults: number;
  matchesScored: number;
  isViewer: boolean;
}

export interface BuildLeaderboardInput {
  scores: readonly LeaderboardScoreInput[];
  /** Previous gameweek's snapshot rows; empty when there isn't one. */
  previousSeasonTotals: readonly PreviousSeasonTotal[];
  /** Gameweeks that have been scored, any order. */
  scoredGameweeks: readonly ScoredGameweek[];
  viewerId: string;
}

/**
 * Scored gameweeks whose earliest Tipped Match kicked off at or after the
 * player joined. The boundary is inclusive at kickoff: a player who joins
 * mid-gameweek -- after that gameweek's first tipped kickoff -- starts
 * counting from the next one, so an unavoidable zero is never charged to
 * them (ADR 0012 D3).
 */
export function countGameweeksPlayed(
  scoredGameweeks: readonly ScoredGameweek[],
  joinedAtIso: string,
): number {
  const joinedAt = new Date(joinedAtIso).getTime();
  return scoredGameweeks.filter(
    (gw) => new Date(gw.earliestKickoffUtcIso).getTime() >= joinedAt,
  ).length;
}

/** Dense rank over humans only, keyed by player id. Bots are absent. */
function humanRanks(
  entries: readonly { playerId: string; isBot: boolean; points: number }[],
): Map<string, number> {
  const ranked = rankScores(
    entries
      .filter((entry) => !entry.isBot)
      .map((entry) => ({ playerId: entry.playerId, points: entry.points })),
  );
  return new Map(ranked.map((row) => [row.playerId, row.rank]));
}

export function buildLeaderboard({
  scores,
  previousSeasonTotals,
  scoredGameweeks,
  viewerId,
}: BuildLeaderboardInput): LeaderboardRow[] {
  const currentRanks = humanRanks(scores);

  // The previous snapshot is re-ranked here rather than read as a stored
  // rank, and is filtered to players who are still in the competition and
  // still on the same footing -- `isBot` comes from the live roster, since
  // the snapshot rows carry only ids and totals.
  const botIds = new Set(
    scores.filter((row) => row.isBot).map((row) => row.playerId),
  );
  const previousRanks = humanRanks(
    previousSeasonTotals.map((row) => ({
      playerId: row.playerId,
      isBot: botIds.has(row.playerId),
      points: row.seasonTotal,
    })),
  );

  return [...scores]
    .sort((a, b) => b.points - a.points)
    .map((row) => {
      const rank = row.isBot ? null : (currentRanks.get(row.playerId) ?? null);
      const previousRank = row.isBot
        ? undefined
        : previousRanks.get(row.playerId);

      const gameweeksPlayed = countGameweeksPlayed(
        scoredGameweeks,
        row.joinedAt,
      );

      return {
        playerId: row.playerId,
        displayName: row.displayName,
        emoji: row.emoji,
        isBot: row.isBot,
        rank,
        movement:
          rank !== null && previousRank !== undefined
            ? previousRank - rank
            : null,
        points: row.points,
        gameweeksPlayed,
        pointsPerGameweek:
          gameweeksPlayed > 0
            ? Math.round((row.points / gameweeksPlayed) * 10) / 10
            : null,
        exactTips: row.exactTips,
        correctResults: row.correctResults,
        matchesScored: row.matchesScored,
        isViewer: row.playerId === viewerId,
      };
    });
}
