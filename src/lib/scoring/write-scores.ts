import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoreRow } from "./match";

/**
 * Writes the authoritative row set for a match into the `scores` ledger,
 * upserting on the `unique (player_id, match_id)` constraint — the idempotency
 * backbone of the engine: recompute the rows with `recomputeMatchScores`
 * (in ./match) and this overwrites, never adds. `computed_at` is refreshed so
 * a recompute is traceable. No rows is a no-op (a match not yet scored/voided).
 *
 * Server-only, deliberately separate from the pure scoring logic in ./match:
 * the pure module is imported by client components, and this write-path must
 * never be — it holds the only Supabase touchpoint for match scoring.
 */
export async function writeScores(
  supabase: SupabaseClient,
  rows: ScoreRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase.from("scores").upsert(
    rows.map((row) => ({
      player_id: row.playerId,
      match_id: row.matchId,
      points: row.points,
      computed_at: new Date().toISOString(),
    })),
    { onConflict: "player_id,match_id" },
  );

  if (error) throw error;
}
