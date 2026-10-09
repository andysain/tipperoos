import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writePredictTableScores } from "@/lib/scoring/write-predict-table-scores";
import { loadScoredCohort } from "./cohort";

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
  // The read-and-score half is shared with the comparison page (issue #214
  // D1), so the stored scores and the page's read-time scores come from the
  // same cohort by construction.
  const { results } = await loadScoredCohort(supabase, competitionId);
  if (results.size === 0) return;

  await writePredictTableScores(
    supabase,
    [...results.entries()].map(([playerId, result]) => ({
      playerId,
      result,
    })),
  );
}
