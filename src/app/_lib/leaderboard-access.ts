import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoresForCompetition } from "@/lib/competitions/scope";
import {
  buildLeaderboard,
  type LeaderboardRow,
  type PreviousSeasonTotal,
  type ScoredGameweek,
} from "@/lib/leaderboard/board";

// DB-fetching glue for the leaderboard route (issue #24) -- outside
// src/lib/** for the same reason as pick-board-access.ts: plain scoped
// Supabase round-trips, with every decision that's worth golden-value
// testing pushed into src/lib/leaderboard/board.ts instead.
//
// Every read here is competition-scoped. `scores` is reached only through
// `scoresForCompetition`, never by match_id alone (AGENTS.md), and the
// gameweek and snapshot reads both filter on competition_id + season_id.

/**
 * Gameweeks that have been scored, with the earliest kickoff among their
 * Tipped Matches -- the denominator input for points-per-gameweek-played
 * (ADR 0012 D3).
 *
 * "Scored" is defined as "has standings_snapshots rows", matching how #23's
 * writer runs: the snapshot is written when a gameweek completes, so its
 * presence is the existing signal for a finished, scored gameweek. Deriving
 * it from `scores` instead would count a gameweek as scored the moment its
 * first match result landed, mid-round.
 */
export async function loadScoredGameweeks(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
): Promise<ScoredGameweek[]> {
  const { data: gameweekRows, error: gameweeksError } = await supabase
    .from("gameweeks")
    .select("id, number, match_1_id, match_2_id")
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .order("number", { ascending: true });
  if (gameweeksError) throw gameweeksError;

  const gameweeks = gameweekRows ?? [];
  if (gameweeks.length === 0) return [];

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from("standings_snapshots")
    .select("gameweek_id")
    .in(
      "gameweek_id",
      gameweeks.map((gw) => gw.id),
    );
  if (snapshotError) throw snapshotError;

  const scoredGameweekIds = new Set(
    (snapshotRows ?? []).map((row) => row.gameweek_id),
  );
  const scored = gameweeks.filter((gw) => scoredGameweekIds.has(gw.id));
  if (scored.length === 0) return [];

  const matchIds = scored
    .flatMap((gw) => [gw.match_1_id, gw.match_2_id])
    .filter((id): id is string => id !== null);
  if (matchIds.length === 0) return [];

  const { data: matchRows, error: matchesError } = await supabase
    .from("matches")
    .select("id, kickoff_time")
    .in("id", matchIds);
  if (matchesError) throw matchesError;

  const kickoffById = new Map(
    (matchRows ?? []).map((row) => [row.id, row.kickoff_time as string]),
  );

  return scored.flatMap((gw) => {
    // A Skipped Slot leaves a null match id and contributes no kickoff; a
    // gameweek where both slots were skipped has no kickoff at all and so
    // can't be attributed to anyone's joined_at -- drop it rather than
    // guess a boundary.
    const kickoffs = [gw.match_1_id, gw.match_2_id]
      .filter((id): id is string => id !== null)
      .map((id) => kickoffById.get(id))
      .filter((k): k is string => k !== undefined)
      .sort();
    if (kickoffs.length === 0) return [];
    return [{ number: gw.number, earliestKickoffUtcIso: kickoffs[0] }];
  });
}

/**
 * The previous gameweek's stored season totals, re-ranked by the caller
 * (ADR 0012 D2/D12) rather than read as `season_standing` -- that column is
 * bot-inclusive by design (#23 D3), so diffing a humans-only live rank
 * against it would be wrong for every player below a bot.
 */
export async function loadPreviousSeasonTotals(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  previousGameweekNumber: number,
): Promise<PreviousSeasonTotal[]> {
  if (previousGameweekNumber < 1) return [];

  const { data: gameweek, error: gameweekError } = await supabase
    .from("gameweeks")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .eq("number", previousGameweekNumber)
    .maybeSingle();
  if (gameweekError) throw gameweekError;
  if (!gameweek) return [];

  const { data, error } = await supabase
    .from("standings_snapshots")
    .select("player_id, season_total")
    .eq("gameweek_id", gameweek.id);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    playerId: row.player_id,
    seasonTotal: row.season_total,
  }));
}

export interface LeaderboardView {
  rows: LeaderboardRow[];
  /** False before the competition's first scored match -- ADR 0012 D8. */
  scored: boolean;
}

/**
 * Serial Supabase depth 3 on this route: seasonId -> current gameweek
 * number (needs seasonId) -> this one parallel wave. Matches the Pick
 * Board's shape (docs/standards/PERFORMANCE_TESTING_STANDARD.md §4.1).
 */
export async function loadLeaderboard(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  viewerId: string,
  previousGameweekNumber: number | null,
): Promise<LeaderboardView> {
  const [scores, previousSeasonTotals, scoredGameweeks] = await Promise.all([
    scoresForCompetition(supabase, competitionId, seasonId),
    previousGameweekNumber !== null
      ? loadPreviousSeasonTotals(
          supabase,
          competitionId,
          seasonId,
          previousGameweekNumber,
        )
      : Promise.resolve([]),
    loadScoredGameweeks(supabase, competitionId, seasonId),
  ]);

  return {
    rows: buildLeaderboard({
      scores,
      previousSeasonTotals,
      scoredGameweeks,
      viewerId,
    }),
    scored: scores.some((row) => row.matchesScored > 0),
  };
}
