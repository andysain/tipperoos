import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scorePredictTableCohort,
  type CohortEntry,
  type TeamId,
} from "@/lib/scoring/predict-table";
import { writePredictTableScores } from "@/lib/scoring/write-predict-table-scores";
import { BAND_KEYS, isBandKey } from "./rules";
import { isLateJoiner } from "./rules";

interface PlayerRow {
  id: string;
  joined_at: string;
}

interface TablePredictionRow {
  id: string;
  player_id: string;
  submitted_at: string | null;
  is_skipped: boolean;
}

interface RankRow {
  table_prediction_id: string;
  team_id: string;
  band: string;
}

interface StandingsRow {
  team_id: string;
  position: number;
}

const bandIndexByKey = new Map(BAND_KEYS.map((key, index) => [key, index]));

/**
 * Issue #157: recomputes the whole competition's Predict the Table cohort
 * and upserts the result into `table_prediction_scores`. Called from two
 * trigger sites (the issue's decision log): the standings sync (every
 * competition, once standings change) and each of
 * `table-predictions/{submit,assign,unassign}` (the mutating player's own
 * competition, since Bold Call rarity is cohort-wide -- one player's edit
 * can move another player's score, so a per-player recompute wouldn't be
 * enough).
 *
 * A no-op (not an error) when there's no complete 20-team standings
 * ordering yet -- `scorePredictTableCohort` requires exactly
 * `TOTAL_TEAMS` (20) actual positions, which doesn't exist before the
 * season's first successful standings sync.
 */
export async function recomputePredictTableCohort(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<void> {
  const { data: seasonRow, error: seasonError } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (seasonError) throw seasonError;
  if (!seasonRow) return;
  const seasonId: string = seasonRow.id;

  const { data: standingsRows, error: standingsError } = await supabase
    .from("team_standings")
    .select("team_id, position")
    .eq("season_id", seasonId)
    .order("position", { ascending: true });
  if (standingsError) throw standingsError;

  const actualOrder: TeamId[] = ((standingsRows ?? []) as StandingsRow[]).map(
    (row) => row.team_id,
  );
  if (actualOrder.length !== 20) return;

  const { data: earliestMatch, error: kickoffError } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("season_id", seasonId)
    .order("kickoff_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (kickoffError) throw kickoffError;
  const gameweekOneKickoff = earliestMatch?.kickoff_time
    ? new Date(earliestMatch.kickoff_time)
    : null;

  const { data: playerRows, error: playersError } = await supabase
    .from("players")
    .select("id, joined_at")
    .eq("competition_id", competitionId)
    .eq("is_bot", false)
    .order("id");
  if (playersError) throw playersError;

  const players = (playerRows ?? []) as PlayerRow[];
  if (players.length === 0) return;
  const playerIds = players.map((p) => p.id);

  const { data: predictionRows, error: predictionsError } = await supabase
    .from("table_predictions")
    .select("id, player_id, submitted_at, is_skipped")
    .in("player_id", playerIds)
    .order("id");
  if (predictionsError) throw predictionsError;

  const submittedPredictions = (
    (predictionRows ?? []) as TablePredictionRow[]
  ).filter((row) => row.submitted_at !== null && !row.is_skipped);
  if (submittedPredictions.length === 0) return;

  const predictionIds = submittedPredictions.map((row) => row.id);
  const { data: rankRows, error: ranksError } = await supabase
    .from("table_prediction_ranks")
    .select("table_prediction_id, team_id, band")
    .in("table_prediction_id", predictionIds)
    .order("id");
  if (ranksError) throw ranksError;

  const ranksByPredictionId = new Map<string, RankRow[]>();
  for (const row of (rankRows ?? []) as RankRow[]) {
    const bucket = ranksByPredictionId.get(row.table_prediction_id) ?? [];
    bucket.push(row);
    ranksByPredictionId.set(row.table_prediction_id, bucket);
  }

  const joinedAtByPlayerId = new Map(
    players.map((p) => [p.id, new Date(p.joined_at)]),
  );

  const entries: CohortEntry<string>[] = submittedPredictions.map((row) => {
    const ranks = ranksByPredictionId.get(row.id) ?? [];
    const bands = new Map<TeamId, number>();
    for (const rank of ranks) {
      if (!isBandKey(rank.band)) continue;
      const bandIndex = bandIndexByKey.get(rank.band);
      if (bandIndex === undefined) continue;
      bands.set(rank.team_id, bandIndex);
    }
    const joinedAt = joinedAtByPlayerId.get(row.player_id) ?? new Date(0);
    return {
      key: row.player_id,
      bands,
      boldCallEligible: !isLateJoiner(joinedAt, gameweekOneKickoff),
    };
  });

  const results = scorePredictTableCohort(entries, actualOrder);

  await writePredictTableScores(
    supabase,
    [...results.entries()].map(([playerId, result]) => ({
      playerId,
      result,
    })),
  );
}
