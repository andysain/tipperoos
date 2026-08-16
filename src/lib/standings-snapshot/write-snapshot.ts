import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerStandingsSnapshot } from "./compute-snapshot";

/**
 * Writes the authoritative row set for one gameweek into the
 * `standings_snapshots` ledger, upserting on the `unique (gameweek_id,
 * player_id)` constraint -- same idempotency shape as ./write-scores.ts's
 * `writeScores`: recompute the rows with `computeGameweekStandings` and this
 * overwrites, never adds. No rows is a no-op.
 *
 * Server-only, deliberately separate from the pure compute logic in
 * ./compute-snapshot.ts, which stays free of any Supabase touchpoint.
 *
 * No `computed_at`-equivalent refresh here, unlike `write-scores.ts`:
 * `standings_snapshots` has no such column (only `created_at`, set once by
 * its DB default) -- there's nothing to stamp on an upsert.
 */
export async function writeStandingsSnapshot(
  supabase: SupabaseClient,
  gameweekId: string,
  rows: PlayerStandingsSnapshot[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase.from("standings_snapshots").upsert(
    rows.map((row) => ({
      gameweek_id: gameweekId,
      player_id: row.playerId,
      gameweek_score: row.gameweekScore,
      season_total: row.seasonTotal,
      season_standing: row.seasonStanding,
    })),
    { onConflict: "gameweek_id,player_id" },
  );

  if (error) throw error;
}
