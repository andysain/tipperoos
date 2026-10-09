import { scoreMatch } from "@/lib/scoring/match";

/**
 * Correct-result streaks for the Season leaderboard (issue #217) and the
 * Gameweek wrap's On Fire / Streak Snapped awards (#218).
 *
 * A streak is consecutive RIGHT-RESULT matches in kickoff order across the
 * competition's Tipped Matches. "Right result" is the scoring engine's own
 * breakdown (`result !== null`), not a points threshold: a Wrong Way Round
 * scores a point but has the result wrong, and a future points multiplier
 * (ADR 0009, deferred) can't move this predicate.
 *
 * The caller decides the match set -- the leaderboard passes every tipped
 * match with a final result; #218 passes only gameweeks <= N (or N-1).
 *
 * A Late Joiner's sequence starts at the first match kicking off at or
 * after their joined_at (#217 D6) -- inclusive at kickoff, the same
 * comparison `countGameweeksPlayed` makes per gameweek. The app can't write
 * a pick before joined_at, but the schema doesn't forbid one, so the
 * boundary is applied rather than assumed.
 */

export interface StreakMatch {
  id: string;
  kickoffUtcIso: string;
  providerMatchId: string;
  /** Null until the final score lands; such a match is skipped. */
  result: { home: number; away: number } | null;
  /** A Voided Match neither extends nor breaks a streak. */
  voided: boolean;
}

export interface StreakPick {
  playerId: string;
  matchId: string;
  home: number;
  away: number;
}

export interface StreakPlayer {
  id: string;
  isBot: boolean;
  joinedAt: string;
}

/** A run of right results: the one in progress, and the season's longest. */
export interface Streak {
  current: number;
  best: number;
}

export interface PlayerStreak extends Streak {
  playerId: string;
}

/** Whether a match is in the streak sequence at all: not voided, and its
 *  final score has landed. Anything else neither extends nor breaks. */
export function countsTowardStreak(match: StreakMatch): boolean {
  return !match.voided && match.result !== null;
}

/** The leaderboard shows the 🔥 badge from this many in a row. */
export const STREAK_BADGE_MIN = 5;

/** Whether a streak earns the leaderboard's 🔥 badge. A bot has none. */
export function earnsStreakBadge(streak: Streak | null): streak is Streak {
  return streak !== null && streak.current >= STREAK_BADGE_MIN;
}

/**
 * Kickoff, then provider id as a number -- the same final tie-break
 * `selectTopMatchup` uses -- so two matches at one kickoff can't order
 * arbitrarily. A non-numeric id falls back to a text compare, keeping the
 * order total.
 */
export function compareStreakMatches(a: StreakMatch, b: StreakMatch): number {
  const byKickoff =
    new Date(a.kickoffUtcIso).getTime() - new Date(b.kickoffUtcIso).getTime();
  if (byKickoff !== 0) return byKickoff;
  const aId = Number(a.providerMatchId);
  const bId = Number(b.providerMatchId);
  if (!Number.isNaN(aId) && !Number.isNaN(bId)) return aId - bId;
  return a.providerMatchId.localeCompare(b.providerMatchId);
}

/** The streak's definition of "right": the scoring engine's own result
 *  breakdown, so a Wrong Way Round (result wrong, 1 point) never counts. */
export function isRightResult(
  pick: { home: number; away: number },
  result: { home: number; away: number },
): boolean {
  return (
    scoreMatch(pick.home, pick.away, result.home, result.away).breakdown
      .result !== null
  );
}

/** One row per human player; bots get no streak (ADR 0012 D12). */
export function computeStreaks({
  matches,
  picks,
  players,
}: {
  matches: readonly StreakMatch[];
  picks: readonly StreakPick[];
  players: readonly StreakPlayer[];
}): PlayerStreak[] {
  const counted = matches
    .filter(countsTowardStreak)
    .sort(compareStreakMatches)
    .flatMap((match) =>
      match.result === null
        ? []
        : [
            {
              id: match.id,
              kickoff: new Date(match.kickoffUtcIso).getTime(),
              result: match.result,
            },
          ],
    );
  const pickByKey = new Map(
    picks.map((p) => [`${p.playerId}:${p.matchId}`, p]),
  );

  return players
    .filter((player) => !player.isBot)
    .map((player) => {
      const joinedAt = new Date(player.joinedAt).getTime();
      let current = 0;
      let best = 0;
      for (const match of counted) {
        if (match.kickoff < joinedAt) continue;
        const pick = pickByKey.get(`${player.id}:${match.id}`);
        const { home, away } = match.result;
        const right = pick !== undefined && isRightResult(pick, { home, away });
        current = right ? current + 1 : 0;
        best = Math.max(best, current);
      }
      return { playerId: player.id, current, best };
    });
}

/** Supabase's `max_rows` (supabase/config.toml). A read past it truncates
 *  silently -- the #182 class of bug -- so a read that comes back AT it
 *  must be treated as possibly truncated. */
export const SUPABASE_MAX_ROWS = 1000;

/** Rows per chunked read: the cap with headroom. */
const ROW_BUDGET = 900;

/**
 * Splits `ids` so a read returning up to `rowsPerId` rows per id stays under
 * the row cap, for issuing as one parallel `Promise.all`. No rows per id (no
 * humans) means nothing to read, so no chunks.
 */
export function chunkForRowCap<T>(ids: readonly T[], rowsPerId: number): T[][] {
  if (rowsPerId <= 0 || ids.length === 0) return [];
  const size = Math.max(1, Math.floor(ROW_BUDGET / rowsPerId));
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}
