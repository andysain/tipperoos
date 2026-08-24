import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputePredictTableCohort } from "@/lib/table-predictions/recompute-cohort";

/**
 * Issue #157: the mutation-trigger half of the recompute (the other half is
 * the standings sync, wired directly in its own route). Looks up the
 * mutating player's `competition_id` and recomputes that whole
 * competition's cohort -- not just this player -- because Bold Call rarity
 * is a function of the eligible cohort, so one player's edit can move
 * another player's score. Best-effort: a failure here shouldn't turn a
 * successful pick-mutation into a 500 for the player who just made it, so
 * callers should not let this throw block their response.
 */
export async function recomputeCohortForPlayer(
  supabase: SupabaseClient,
  playerId: string,
): Promise<void> {
  try {
    const { data: player, error } = await supabase
      .from("players")
      .select("competition_id")
      .eq("id", playerId)
      .order("id")
      .maybeSingle();
    if (error || !player) return;

    await recomputePredictTableCohort(supabase, player.competition_id);
  } catch {
    // Best-effort -- the pick mutation itself already succeeded and its
    // response has already been decided by the caller. The next standings
    // sync (or a later successful mutation) will recompute anyway.
  }
}
