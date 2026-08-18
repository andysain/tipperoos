import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StandingsSnapshotInputs {
  players: { playerId: string }[];
  gameweekScoreRows: { playerId: string; points: number }[];
  seasonScoreRows: { playerId: string; points: number }[];
}

interface GameweekMatchRow {
  number: number;
  match_1_id: string | null;
  match_2_id: string | null;
}

function slotMatchIds(gameweek: GameweekMatchRow): string[] {
  return [gameweek.match_1_id, gameweek.match_2_id].filter(
    (id): id is string => id !== null,
  );
}

/**
 * This gameweek's own two Tipped Matches only -- at most 2 matches x roster
 * rows, always safe, so it stays a raw per-match select (no aggregation
 * needed, and it isn't the query issue #182 was about).
 */
async function fetchScoreRows(
  supabase: SupabaseClient,
  playerIds: string[],
  matchIds: string[],
): Promise<{ playerId: string; points: number }[]> {
  if (matchIds.length === 0) return [];

  const { data, error } = await supabase
    .from("scores")
    .select("player_id, points")
    .in("player_id", playerIds)
    .in("match_id", matchIds);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    playerId: row.player_id,
    points: row.points,
  }));
}

/**
 * Every gameweek 1..N's matches, cumulative -- grows across the whole
 * season, the same unbounded shape `scoresForCompetition` had (issue #182).
 * Aggregated in SQL (`score_totals_for_matches`,
 * supabase/migrations/20260818020000_score_totals_aggregate.sql) so the
 * response is one row per player regardless of season length, instead of
 * one row per scored match per player.
 */
async function fetchSeasonScoreRows(
  supabase: SupabaseClient,
  playerIds: string[],
  matchIds: string[],
): Promise<{ playerId: string; points: number }[]> {
  if (matchIds.length === 0) return [];

  const { data, error } = await supabase.rpc("score_totals_for_matches", {
    p_player_ids: playerIds,
    p_match_ids: matchIds,
  });
  if (error) throw error;

  return ((data ?? []) as { player_id: string; points: number }[]).map(
    (row) => ({
      playerId: row.player_id,
      points: row.points,
    }),
  );
}

/**
 * Resolves the DB rows `computeGameweekStandings` (./compute-snapshot.ts)
 * needs for one gameweek -- issue #23 D2. `gameweeks.match_1_id`/
 * `match_2_id` are the only link from a gameweek to its matches (no
 * `matches.gameweek_id` column exists); a null slot is a Skipped Slot and
 * contributes nothing (it never entered scoring), and a voided match
 * already carries an explicit 0-point `scores` row per player (issue #21
 * D4), so neither needs special-casing here -- both read as already-zero.
 *
 * Score rows are read through the same competition-scoping convention
 * `src/lib/competitions/scope.ts` documents: always join back to
 * `players.competition_id`, never trust `match_id` alone as a boundary.
 */
export async function loadStandingsSnapshotInputs(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  gameweekNumber: number,
): Promise<StandingsSnapshotInputs> {
  const { data: playerRows, error: playersError } = await supabase
    .from("players")
    .select("id")
    .eq("competition_id", competitionId);
  if (playersError) throw playersError;

  const playerIds = (playerRows ?? []).map((p) => p.id);
  if (playerIds.length === 0) {
    return { players: [], gameweekScoreRows: [], seasonScoreRows: [] };
  }

  const { data: gameweekRows, error: gameweeksError } = await supabase
    .from("gameweeks")
    .select("number, match_1_id, match_2_id")
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .lte("number", gameweekNumber);
  if (gameweeksError) throw gameweeksError;

  const rows: GameweekMatchRow[] = gameweekRows ?? [];
  const currentGameweekRow = rows.find((gw) => gw.number === gameweekNumber);
  const gameweekMatchIds = currentGameweekRow
    ? slotMatchIds(currentGameweekRow)
    : [];
  const seasonMatchIds = rows.flatMap(slotMatchIds);

  const [gameweekScoreRows, seasonScoreRows] = await Promise.all([
    fetchScoreRows(supabase, playerIds, gameweekMatchIds),
    fetchSeasonScoreRows(supabase, playerIds, seasonMatchIds),
  ]);

  return {
    players: playerIds.map((id) => ({ playerId: id })),
    gameweekScoreRows,
    seasonScoreRows,
  };
}
