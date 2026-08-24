import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { recomputePredictTableCohort } from "@/lib/table-predictions/recompute-cohort";

/**
 * Issue #157: the mutation-trigger half of the recompute (the other half is
 * the standings sync, wired directly in its own route). Looks up the
 * mutating player's `competition_id` and recomputes that whole
 * competition's cohort -- not just this player -- because Bold Call rarity
 * is a function of the eligible cohort, so one player's edit can move
 * another player's score.
 *
 * `docs/standards/PERFORMANCE_TESTING_STANDARD.md` gives
 * `assign`/`unassign`/`submit` a 250ms budget as "one RPC + auth ... need
 * no work" -- the ~6-round-trip cohort recompute this triggers cannot run
 * on the request path without blowing that budget (found during this
 * issue's own code review; the decision log's "off the performance-critical
 * path" call didn't check this specific budget). So this is scheduled with
 * `waitUntil` -- the caller's response is sent immediately, and the
 * recompute finishes in the background rather than delaying it or risking
 * being killed mid-flight once the response ships (a bare fire-and-forget
 * `void` call has no such guarantee on Vercel's serverless runtime).
 */
export function scheduleCohortRecomputeForPlayer(
  supabase: SupabaseClient,
  playerId: string,
): void {
  waitUntil(
    (async () => {
      const { data: player, error } = await supabase
        .from("players")
        .select("competition_id")
        .eq("id", playerId)
        .order("id")
        .maybeSingle();
      if (error || !player) return;

      await recomputePredictTableCohort(supabase, player.competition_id);
    })().catch(() => {
      // Best-effort -- the pick mutation itself already succeeded and its
      // response has already been sent. The next standings sync (or a
      // later successful mutation) will recompute anyway.
    }),
  );
}
