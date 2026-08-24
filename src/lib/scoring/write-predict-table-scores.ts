import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PredictTableScoreResult } from "./predict-table";

export interface PredictTableScoreRow {
  playerId: string;
  result: PredictTableScoreResult;
}

/**
 * Writes the whole competition's cohort into `table_prediction_scores`,
 * upserting on the `unique (player_id)` constraint -- mirrors
 * `write-scores.ts`'s idempotency shape (issue #21 D4): recompute with
 * `scorePredictTableCohort` and this overwrites, never adds. `computed_at`
 * is refreshed so a recompute is traceable. No rows is a no-op (an empty
 * cohort -- nobody has submitted yet).
 *
 * Server-only, deliberately separate from the pure scoring logic in
 * ./predict-table: the pure module has no Supabase touchpoint, and this
 * write-path holds the only one for Predict the Table scoring.
 */
export async function writePredictTableScores(
  supabase: SupabaseClient,
  rows: PredictTableScoreRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const computedAt = new Date().toISOString();
  const { error } = await supabase.from("table_prediction_scores").upsert(
    rows.map(({ playerId, result }) => ({
      player_id: playerId,
      total_score: result.totalScore,
      placement_score: result.placementScore,
      band_bonus_score: result.bandBonusScore,
      bold_call_score: result.boldCallScore,
      computed_at: computedAt,
    })),
    { onConflict: "player_id" },
  );

  if (error) throw error;
}
