import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTablePredictionEditability,
  type TablePredictionEditability,
} from "@/lib/table-predictions/rules";

// DB-fetching glue for the Predict the Table lock/late-joiner rules --
// deliberately outside src/lib/** (see session-cookie.ts for the same
// rationale: the golden-value discipline in TESTING_STANDARD.md targets
// pure decision logic, which already has its own tests in
// src/lib/table-predictions/rules.test.ts; there's no meaningful golden
// value to assert on a Supabase round-trip itself).

/**
 * Gameweek 1's first kickoff = the earliest kickoff among the current
 * season's seeded fixtures. There's no explicit gameweek-number column on
 * `matches`, but since all 380 fixtures are seeded up front and gameweek 1
 * is chronologically first, the season-wide earliest kickoff is exactly
 * that instant. Null if the season/fixtures haven't been seeded yet.
 */
export async function getGameweekOneKickoff(
  supabase: SupabaseClient,
): Promise<Date | null> {
  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (!season) return null;

  const { data: match } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("season_id", season.id)
    .order("kickoff_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!match) return null;

  return new Date(match.kickoff_time);
}

export async function getTablePredictionEditabilityForPlayer(
  supabase: SupabaseClient,
  params: { joinedAt: Date; now: Date },
): Promise<TablePredictionEditability> {
  const gameweekOneKickoff = await getGameweekOneKickoff(supabase);
  return getTablePredictionEditability({ ...params, gameweekOneKickoff });
}

export interface TablePredictionPlayer {
  id: string;
  joinedAt: Date;
}

// Shared by all three table-predictions routes (assign/submit/skip), each of
// which needs the same "look up the session's player" step before applying
// any lock/late-joiner rule.
export async function getPlayerForTablePrediction(
  supabase: SupabaseClient,
  playerId: string,
): Promise<TablePredictionPlayer | null> {
  const { data: player, error } = await supabase
    .from("players")
    .select("id, joined_at")
    .eq("id", playerId)
    .maybeSingle();
  if (error || !player) return null;
  return { id: player.id, joinedAt: new Date(player.joined_at) };
}
