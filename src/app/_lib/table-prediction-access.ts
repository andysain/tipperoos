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

export interface TablePredictionRecord {
  id: string;
  submittedAt: string | null;
  skipped: boolean;
}

/**
 * This player's Predict the Table record, if any -- shared by /predict-table
 * (issue #26, which also needs `id` to fetch band assignments and the raw
 * `submittedAt` timestamp) and the Pick Board's prompt banner (issue #90,
 * decision 6), so the two call sites can't drift apart on what "submitted"
 * means -- the prompt only needs `submittedAt != null`. A row with neither
 * `submitted_at` nor `is_skipped` set exists mid-sort (moves persist
 * immediately, per CLAUDE.md) and counts as neither. Null means the player
 * has never touched the flow.
 */
export async function getTablePredictionRecord(
  supabase: SupabaseClient,
  playerId: string,
): Promise<TablePredictionRecord | null> {
  const { data: prediction } = await supabase
    .from("table_predictions")
    .select("id, is_skipped, submitted_at")
    .eq("player_id", playerId)
    .maybeSingle();
  if (!prediction) return null;

  return {
    id: prediction.id,
    submittedAt: prediction.submitted_at,
    skipped: prediction.is_skipped ?? false,
  };
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
