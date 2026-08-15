import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type BandKey,
  getTablePredictionEditability,
  isBandKey,
  type TablePredictionEditability,
} from "@/lib/table-predictions/rules";
import type { TablePredictionStripTeam } from "@/lib/table-predictions/strip-state";

export async function getDatabaseTime(
  supabase: SupabaseClient,
): Promise<Date | null> {
  const { data, error } = await supabase.rpc("get_db_time");
  if (error || typeof data !== "string") return null;
  return new Date(data);
}

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
  // .order() required even though player_id is unique on this table
  // (AGENTS.md: "Never select a row without an explicit .order()").
  const { data: prediction } = await supabase
    .from("table_predictions")
    .select("id, is_skipped, submitted_at")
    .eq("player_id", playerId)
    .order("id")
    .maybeSingle();
  if (!prediction) return null;

  return {
    id: prediction.id,
    submittedAt: prediction.submitted_at,
    skipped: prediction.is_skipped ?? false,
  };
}

export interface TablePredictionStripData {
  championTeam: TablePredictionStripTeam | null;
  bandCounts: Partial<Record<BandKey, number>>;
  leaguePosition: number | null;
}

/**
 * Pick Board Table Prediction Strip data (issue #156): the Champion Band's
 * single team (null if it doesn't hold exactly one -- never assigned, or a
 * capture-invariant violation), each Band's current member count, and the
 * Champion's current league position. Deliberately returns the raw counts
 * rather than calling `validateBandCounts()` itself -- that's a rules.ts
 * concern (this file is DB-fetching glue only, per its own doc comment
 * above), so the caller runs the counts through `validateBandCounts()`
 * before handing "Band-count validity" to `deriveTablePredictionStripState()`.
 *
 * `tablePredictionId` is caller-resolved (from `getTablePredictionRecord()`,
 * same rationale as `loadPickBoardGameweek`'s caller-resolved `seasonId`/
 * `gameweekNumber`) so this can join the Pick Board route's existing
 * parallel wave instead of forcing a second one -- see issue #156's
 * decision log.
 *
 * Two sequential round trips internally (ranks, then team+standings) once
 * the Champion is known -- same shape as `loadPickBoardGameweek`'s own
 * internal sequencing; this whole function is still just one peer in the
 * caller's outer `Promise.all`.
 */
export async function getTablePredictionStripData(
  supabase: SupabaseClient,
  tablePredictionId: string,
  seasonId: string,
): Promise<TablePredictionStripData> {
  const { data: ranks, error } = await supabase
    .from("table_prediction_ranks")
    .select("team_id, band")
    .eq("table_prediction_id", tablePredictionId);
  if (error) throw error;

  const rows: { team_id: string; band: string }[] = ranks ?? [];
  const bandCounts: Partial<Record<BandKey, number>> = {};
  for (const row of rows) {
    if (!isBandKey(row.band)) continue;
    bandCounts[row.band] = (bandCounts[row.band] ?? 0) + 1;
  }

  const championRows = rows.filter((row) => row.band === "champion");
  if (championRows.length !== 1) {
    return { championTeam: null, bandCounts, leaguePosition: null };
  }
  const championTeamId = championRows[0].team_id;

  const [teamResult, standingsResult] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, short_code")
      .eq("id", championTeamId)
      .order("id")
      .maybeSingle(),
    supabase
      .from("team_standings")
      .select("position")
      .eq("season_id", seasonId)
      .eq("team_id", championTeamId)
      .order("team_id")
      .maybeSingle(),
  ]);
  if (teamResult.error) throw teamResult.error;
  if (standingsResult.error) throw standingsResult.error;

  const team = teamResult.data;
  if (!team) return { championTeam: null, bandCounts, leaguePosition: null };

  return {
    championTeam: { id: team.id, name: team.name, shortCode: team.short_code },
    bandCounts,
    leaguePosition: standingsResult.data?.position ?? null,
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
