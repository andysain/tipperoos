import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTableLeaderboard,
  type TableLeaderboardRow,
} from "@/lib/leaderboard/table-board";
import { isLateJoiner } from "@/lib/table-predictions/rules";
import { getGameweekOneKickoff } from "./table-prediction-access";

// DB-fetching glue for the leaderboard's Predict the Table segment (issue
// #171) -- outside src/lib/** for the same reason as leaderboard-access.ts:
// plain scoped Supabase round-trips, with every decision worth golden-value
// testing pushed into src/lib/leaderboard/table-board.ts instead.
//
// Every read here is competition-scoped, following the same convention as
// scoresForCompetition (src/lib/competitions/scope.ts) -- players filtered
// on competition_id, never a query keyed on anything that crosses
// competitions.

interface PlayerRow {
  id: string;
  display_name: string;
  emoji: string | null;
  joined_at: string;
}

interface PredictionStateRow {
  player_id: string;
  submitted_at: string | null;
  is_skipped: boolean;
}

interface ScoreRow {
  player_id: string;
  total_score: number;
  placement_score: number;
  band_bonus_score: number;
  bold_call_score: number;
}

export interface TableLeaderboardView {
  rows: TableLeaderboardRow[];
  /** False before any player in this competition has ever been scored. */
  scored: boolean;
}

/**
 * Only players with a submitted, non-skipped table AND a
 * `table_prediction_scores` row are included (the first condition is issue
 * #214 D2, below) -- a player who never submitted (or hasn't been through a
 * cohort recompute yet) has no score to show, and isn't given a
 * misrepresenting 0 (CLAUDE.md's "no pick, no points" principle, applied
 * here to Predict the Table). Bots are excluded at the source: they never
 * submit a Predict the Table, so the `is_bot = false` filter is the whole
 * mechanism -- no separate "no Bots on this board" branch needed (D13).
 */
export async function loadTableLeaderboard(
  supabase: SupabaseClient,
  competitionId: string,
  viewerId: string,
): Promise<TableLeaderboardView> {
  const [playersResult, gameweekOneKickoff] = await Promise.all([
    supabase
      .from("players")
      .select("id, display_name, emoji, joined_at")
      .eq("competition_id", competitionId)
      .eq("is_bot", false)
      .order("id"),
    getGameweekOneKickoff(supabase),
  ]);
  if (playersResult.error) throw playersResult.error;

  const players = (playersResult.data ?? []) as PlayerRow[];
  if (players.length === 0) return { rows: [], scored: false };
  const playerIds = players.map((p) => p.id);

  // Both keyed only on the player ids, so they share one round trip.
  const [scoresResult, predictionsResult] = await Promise.all([
    supabase
      .from("table_prediction_scores")
      .select(
        "player_id, total_score, placement_score, band_bonus_score, bold_call_score",
      )
      .in("player_id", playerIds)
      .order("player_id"),
    supabase
      .from("table_predictions")
      .select("player_id, submitted_at, is_skipped")
      .in("player_id", playerIds)
      .order("player_id"),
  ]);
  if (scoresResult.error) throw scoresResult.error;
  if (predictionsResult.error) throw predictionsResult.error;

  // Issue #214 D2: submitted tables only. A score row outlives its table --
  // scores are only ever upserted, while skipping and every pre-deadline
  // Band move reset `submitted_at` -- so a frozen score would otherwise sit
  // on the board forever, and its row would link to a table the comparison
  // page refuses to show. Filtered at read time; no score row is deleted.
  const hasSubmittedTable = new Set(
    ((predictionsResult.data ?? []) as PredictionStateRow[])
      .filter((p) => p.submitted_at !== null && !p.is_skipped)
      .map((p) => p.player_id),
  );

  const playerById = new Map(players.map((p) => [p.id, p]));

  const scores = ((scoresResult.data ?? []) as ScoreRow[])
    .filter((row) => hasSubmittedTable.has(row.player_id))
    .map((row) => {
      const player = playerById.get(row.player_id);
      if (!player) return null;
      return {
        playerId: row.player_id,
        displayName: player.display_name,
        emoji: player.emoji,
        isLateJoiner: isLateJoiner(
          new Date(player.joined_at),
          gameweekOneKickoff,
        ),
        totalScore: row.total_score,
        placementScore: row.placement_score,
        bandBonusScore: row.band_bonus_score,
        boldCallScore: row.bold_call_score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return {
    rows: buildTableLeaderboard(scores, viewerId),
    scored: scores.length > 0,
  };
}
