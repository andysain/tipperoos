import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Shared query-helper backstop for match_id-keyed data (issue #71).
 *
 * `picks` and `scores` are keyed by (player_id, match_id) with no
 * competition_id column of their own -- `matches` is a global, shared
 * fixture list, so two competitions can legitimately tip the same
 * real-world match. Any hand-rolled query filtering by match_id alone
 * risks leaking one competition's picks/scores into another's view.
 * These helpers are the only sanctioned way to read that data scoped to
 * a competition -- always join back to players.competition_id (the one
 * table in the chain that actually carries it), never trust match_id
 * alone as a boundary.
 */

export interface CompetitionScoreRow {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  joinedAt: string;
  points: number;
  matchesScored: number;
}

/**
 * Pure fold: combines a competition's player roster with their score rows
 * (already filtered to the right season) into one row per player, players
 * with no score rows yet included at 0 -- required so a Late Joiner or a
 * brand-new player still appears on the leaderboard instead of vanishing.
 */
export function foldCompetitionScores(
  players: {
    id: string;
    displayName: string;
    emoji: string | null;
    isBot: boolean;
    joinedAt: string;
  }[],
  scoreRows: { playerId: string; points: number }[],
): CompetitionScoreRow[] {
  const byPlayer = new Map<string, { points: number; count: number }>();
  for (const row of scoreRows) {
    const existing = byPlayer.get(row.playerId) ?? { points: 0, count: 0 };
    existing.points += row.points;
    existing.count += 1;
    byPlayer.set(row.playerId, existing);
  }

  return players.map((player) => {
    const agg = byPlayer.get(player.id) ?? { points: 0, count: 0 };
    return {
      playerId: player.id,
      displayName: player.displayName,
      emoji: player.emoji,
      isBot: player.isBot,
      joinedAt: player.joinedAt,
      points: agg.points,
      matchesScored: agg.count,
    };
  });
}

/**
 * Leaderboard read, scoped to one competition AND one season (scores has
 * no season column either -- a competition-only filter would silently
 * blend two seasons' points the moment a second season exists, the same
 * latent-corruption shape the match_id leak is).
 *
 * Voided matches are not filtered out here: the scoring recompute is the
 * single authority on their points (zeroed on void), so a voided match's
 * score row already reads 0 by the time this runs. This stays a pure
 * scoped read.
 */
export async function scoresForCompetition(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
): Promise<CompetitionScoreRow[]> {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name, emoji, is_bot, joined_at")
    .eq("competition_id", competitionId);
  if (playersError) throw playersError;

  const playerIds = (players ?? []).map((p) => p.id);
  if (playerIds.length === 0) return [];

  const { data: scoreRows, error: scoresError } = await supabase
    .from("scores")
    .select("player_id, points, matches!inner(season_id)")
    .in("player_id", playerIds)
    .eq("matches.season_id", seasonId);
  if (scoresError) throw scoresError;

  return foldCompetitionScores(
    (players ?? []).map((p) => ({
      id: p.id,
      displayName: p.display_name,
      emoji: p.emoji,
      isBot: p.is_bot,
      joinedAt: p.joined_at,
    })),
    (scoreRows ?? []).map((r) => ({
      playerId: r.player_id,
      points: r.points,
    })),
  );
}

export interface CompetitionPickRow {
  playerId: string;
  displayName: string;
  emoji: string | null;
  isBot: boolean;
  predHomeScore: number | null;
  predAwayScore: number | null;
}

export type PicksForMatchResult =
  { locked: false } | { locked: true; picks: CompetitionPickRow[] };

/** Picks lock 5 minutes before kickoff (CLAUDE.md -> Predictions). */
const LOCK_WINDOW_MS = 5 * 60 * 1000;

export function isMatchLocked(kickoffTime: Date, now: Date): boolean {
  return now.getTime() >= kickoffTime.getTime() - LOCK_WINDOW_MS;
}

/**
 * Pure fold: left-joins a competition's full player roster onto whichever
 * of them picked this match, so non-pickers still appear (pick fields
 * null) rather than silently disappearing from the reveal.
 */
export function foldCompetitionPicks(
  players: {
    id: string;
    displayName: string;
    emoji: string | null;
    isBot: boolean;
  }[],
  pickRows: {
    playerId: string;
    predHomeScore: number;
    predAwayScore: number;
  }[],
): CompetitionPickRow[] {
  const byPlayer = new Map(pickRows.map((row) => [row.playerId, row]));

  return players.map((player) => {
    const pick = byPlayer.get(player.id);
    return {
      playerId: player.id,
      displayName: player.displayName,
      emoji: player.emoji,
      isBot: player.isBot,
      predHomeScore: pick?.predHomeScore ?? null,
      predAwayScore: pick?.predAwayScore ?? null,
    };
  });
}

/**
 * Post-lock pick reveal, scoped to one competition. Enforces the lock
 * itself rather than trusting the caller -- CLAUDE.md: "All lock/deadline
 * enforcement is server-side, always." A helper whose entire job is
 * "return everyone's picks" cannot leave that one line optional; forgetting
 * it breaches pre-lock pick secrecy, which is unrecoverable once it
 * happens (unlike, say, a season-scoping bug, which is visible and
 * fixable after the fact).
 */
export async function picksForMatch(
  supabase: SupabaseClient,
  matchId: string,
  competitionId: string,
): Promise<PicksForMatchResult> {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("id", matchId)
    .single();
  if (matchError) throw matchError;

  if (!isMatchLocked(new Date(match.kickoff_time), new Date())) {
    return { locked: false };
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name, emoji, is_bot")
    .eq("competition_id", competitionId);
  if (playersError) throw playersError;

  const playerIds = (players ?? []).map((p) => p.id);
  if (playerIds.length === 0) return { locked: true, picks: [] };

  const { data: pickRows, error: picksError } = await supabase
    .from("picks")
    .select("player_id, pred_home_score, pred_away_score")
    .eq("match_id", matchId)
    .in("player_id", playerIds);
  if (picksError) throw picksError;

  return {
    locked: true,
    picks: foldCompetitionPicks(
      (players ?? []).map((p) => ({
        id: p.id,
        displayName: p.display_name,
        emoji: p.emoji,
        isBot: p.is_bot,
      })),
      (pickRows ?? []).map((r) => ({
        playerId: r.player_id,
        predHomeScore: r.pred_home_score,
        predAwayScore: r.pred_away_score,
      })),
    ),
  };
}

/**
 * Session-cookie -> competition lookup for authenticated routes (the
 * session holds only a player id). Returns null when the player id
 * doesn't exist -- routine here, not exceptional: sessions are stateless
 * and never expire (CLAUDE.md -> Session), so a signed cookie naming a
 * deleted player, or one minted against a different environment, is an
 * expected shape of input, not a failure. A genuine query error (outage,
 * permissions) still throws -- collapsing that into null too would render
 * a Supabase outage as "every session is invalid."
 *
 * Clearing a dead session cookie on a null result is the caller's job
 * (the future session-auth wrapper), not this resolver's.
 */
export async function resolveCompetitionId(
  supabase: SupabaseClient,
  playerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("players")
    .select("competition_id")
    .eq("id", playerId)
    .maybeSingle();
  if (error) throw error;
  return data?.competition_id ?? null;
}

export interface PlayerScope {
  competitionId: string;
  joinedAt: Date;
}

/**
 * Same session-cookie -> player lookup as resolveCompetitionId, but also
 * returns `joined_at` from the same round trip -- for callers that need
 * both competition scoping and Late-Joiner-aware editability
 * (getTablePredictionEditability) from the same player row, instead of two
 * separate `players` queries for the same session player
 * (docs/standards/PERFORMANCE_TESTING_STANDARD.md's "resolve shared loader
 * inputs once" principle). The Pick Board route (issue #156) is the first
 * caller; resolveCompetitionId above is left alone for callers that only
 * ever needed the one column.
 */
export async function resolvePlayerScope(
  supabase: SupabaseClient,
  playerId: string,
): Promise<PlayerScope | null> {
  const { data, error } = await supabase
    .from("players")
    .select("competition_id, joined_at")
    .eq("id", playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    competitionId: data.competition_id,
    joinedAt: new Date(data.joined_at),
  };
}
